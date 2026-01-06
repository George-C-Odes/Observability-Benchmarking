package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net"
	"os"
	"os/signal"
	"runtime"
	"runtime/debug"
	"runtime/metrics"
	"strconv"
	"strings"
	"syscall"
	"time"

	"hello/internal/cache"
	"hello/internal/config"
	"hello/internal/handlers"
	"hello/internal/logging"
	appotel "hello/internal/otel"

	"github.com/gofiber/contrib/otelfiber/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"

	otelapi "go.opentelemetry.io/otel"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	tracenoop "go.opentelemetry.io/otel/trace/noop"
)

const (
	serviceName          = "go"
	instrumentationName  = "go"
	gracefulShutdownTime = 10 * time.Second
)

func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		panic(err)
	}

	bootstrapLogger := logging.NewJSONLogger(parseLogLevel(cfg.LogLevel)).With(slog.String("service", serviceName))

	// Make sure any slog.Default() usage is consistent immediately.
	slog.SetDefault(bootstrapLogger)

	ctx := context.Background()

	// Telemetry setup (OTLP + optional Pyroscope span profiles)
	tel, err := appotel.Setup(ctx, cfg, bootstrapLogger)
	if err != nil {
		bootstrapLogger.Error("telemetry setup failed", slog.Any("err", err))
		os.Exit(1)
	}

	logger := bootstrapLogger

	// Fan-out stdout JSON logs + OTLP logs (experimental).
	if tel.OtelLogHandler != nil {
		stdoutHandler := logging.NewTraceContextHandler(
			slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLogLevel(cfg.LogLevel)}),
		)
		logger = slog.New(logging.NewMultiHandler(stdoutHandler, tel.OtelLogHandler))
	} else {
		// Keep stdout JSON at minimum
		logger = bootstrapLogger
	}

	slog.SetDefault(logger)

	logBootInfo(logger, cfg)

	c, err := cache.New(cfg.CacheSize, cfg.CacheImpl)
	if err != nil {
		logger.Error("cache init failed", slog.Any("err", err))
		os.Exit(1)
	}

	// Handler uses:
	// - atomic.Uint64 hot-path counter + ObservableCounter export
	// - optional nested spans controlled by APP_HANDLER_SPANS_ENABLED
	h, err := handlers.NewHelloHandler(handlers.HelloHandlerOpts{
		Cache:        c,
		Logger:       logger,
		Tracer:       otelapi.Tracer(instrumentationName),
		Meter:        otelapi.Meter(instrumentationName),
		SpansEnabled: &cfg.HandlerSpansEnabled,
	})
	if err != nil {
		logger.Error("handler init failed", slog.Any("err", err))
		os.Exit(1)
	}

	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          10 * time.Second,
		IdleTimeout:           60 * time.Second,
	})

	app.Use(recover.New())

	// ---- HTTP instrumentation ----
	if cfg.HTTPMiddlewareEnabled {
		spanNameFn := makeSpanNameFormatter(cfg.HTTPSpanNameMode)

		// For performance, we default to TraceContext only (no baggage).
		var propagators propagation.TextMapPropagator
		if cfg.HTTPPropagationEnabled {
			propagators = propagation.TraceContext{}
		} else {
			// Composite with no propagators effectively becomes "no-op extract".
			propagators = propagation.NewCompositeTextMapPropagator()
		}

		switch cfg.HTTPTracesMode {
		case "otelfiber":
			opts := []otelfiber.Option{
				otelfiber.WithPort(cfg.Port),
				otelfiber.WithNext(func(c *fiber.Ctx) bool {
					return isIgnoredPath(c.Path(), cfg.HTTPIgnorePaths)
				}),
				otelfiber.WithCollectClientIP(cfg.HTTPCollectClientIP),
				otelfiber.WithSpanNameFormatter(spanNameFn),
				otelfiber.WithPropagators(propagators),
			}

			if !cfg.HTTPTracesEnabled {
				opts = append(opts, otelfiber.WithTracerProvider(tracenoop.NewTracerProvider()))
			}

			if !cfg.HTTPMetricsEnabled {
				opts = append(opts, otelfiber.WithoutMetrics(true))
				opts = append(opts, otelfiber.WithMeterProvider(metricnoop.NewMeterProvider()))
			}

			app.Use(otelfiber.Middleware(opts...))

		case "minimal":
			// Minimal tracing middleware to keep tracing ON but reduce overhead vs otelfiber.
			// Metrics (if enabled) are still provided via otelfiber with a noop tracer provider
			// to avoid double spans.
			if cfg.HTTPTracesEnabled {
				app.Use(minimalHTTPTracingMiddleware(
					otelapi.Tracer(instrumentationName),
					spanNameFn,
					propagators,
					cfg.HTTPIgnorePaths,
				))
			} else {
				logger.Info("http tracing disabled (OTEL_HTTP_TRACES_ENABLED=false)")
			}

			if cfg.HTTPMetricsEnabled {
				// Metrics-only: otelfiber will still execute, but spans are no-op.
				opts := []otelfiber.Option{
					otelfiber.WithPort(cfg.Port),
					otelfiber.WithNext(func(c *fiber.Ctx) bool {
						return isIgnoredPath(c.Path(), cfg.HTTPIgnorePaths)
					}),
					otelfiber.WithCollectClientIP(cfg.HTTPCollectClientIP),
					otelfiber.WithSpanNameFormatter(spanNameFn),
					otelfiber.WithPropagators(propagators),

					otelfiber.WithTracerProvider(tracenoop.NewTracerProvider()),
				}
				app.Use(otelfiber.Middleware(opts...))
			}

		default:
			// validated in config.LoadFromEnv()
			logger.Error("invalid OTEL_HTTP_TRACES_MODE", slog.String("mode", cfg.HTTPTracesMode))
			os.Exit(1)
		}
	} else {
		logger.Info("http instrumentation disabled (OTEL_HTTP_ENABLED=false)")
	}

	// Lightweight liveness/readiness endpoints
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Get("/readyz", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Get("/livez", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

	// Main endpoint
	app.Get("/hello/virtual", h.Virtual)

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	logger.Info("starting server", slog.String("addr", addr), slog.String("otlp", cfg.OtelEndpoint))

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- app.Listen(addr)
	}()

	// Wait for signal or server error
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		logger.Info("shutdown signal received", slog.String("signal", sig.String()))
	case err := <-serverErr:
		if err != nil && !errors.Is(err, net.ErrClosed) && !strings.Contains(err.Error(), "Server is not running") {
			logger.Error("server error", slog.Any("err", err))
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), gracefulShutdownTime)
	defer cancel()

	_ = app.ShutdownWithContext(shutdownCtx)
	_ = tel.Shutdown(shutdownCtx)
}

func makeSpanNameFormatter(mode string) func(c *fiber.Ctx) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	switch mode {
	case "method":
		return func(c *fiber.Ctx) string {
			return c.Method()
		}
	case "route":
		return func(c *fiber.Ctx) string {
			return routeTemplate(c)
		}
	case "path":
		return func(c *fiber.Ctx) string {
			return c.Path()
		}
	case "method_route":
		return func(c *fiber.Ctx) string {
			return c.Method() + " " + routeTemplate(c)
		}
	case "method_path":
		return func(c *fiber.Ctx) string {
			return c.Method() + " " + c.Path()
		}
	case "constant":
		fallthrough
	default:
		return func(*fiber.Ctx) string {
			return "http.request"
		}
	}
}

func routeTemplate(c *fiber.Ctx) string {
	if r := c.Route(); r != nil && strings.TrimSpace(r.Path) != "" {
		return r.Path
	}
	return c.Path()
}

func minimalHTTPTracingMiddleware(
	tracer trace.Tracer,
	spanNameFn func(*fiber.Ctx) string,
	propagators propagation.TextMapPropagator,
	ignorePaths []string,
) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if isIgnoredPath(c.Path(), ignorePaths) {
			return c.Next()
		}

		ctx := c.UserContext()

		// Avoid allocating a full map of request headers. TraceContext needs only these.
		// If propagation is "disabled", the propagators passed in is effectively no-op.
		ctx = propagators.Extract(ctx, fiberTraceContextCarrier{c: c})

		ctx, span := tracer.Start(ctx, spanNameFn(c), trace.WithSpanKind(trace.SpanKindServer))
		c.SetUserContext(ctx)

		err := c.Next()

		// Minimal error/status handling (keep overhead low)
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, "handler error")
		} else if c.Response().StatusCode() >= 500 {
			span.SetStatus(codes.Error, "server error")
		}

		span.End()
		return err
	}
}

// fiberTraceContextCarrier is a small carrier optimized for TraceContext extraction.
type fiberTraceContextCarrier struct {
	c *fiber.Ctx
}

func (h fiberTraceContextCarrier) Get(key string) string {
	// Fiber header lookup is case-insensitive.
	return h.c.Get(key)
}

func (h fiberTraceContextCarrier) Set(key, value string) {
	// Not needed for extraction in a server middleware.
}

func (h fiberTraceContextCarrier) Keys() []string {
	// Only the keys TraceContext uses; keeps it fast.
	return []string{"traceparent", "tracestate"}
}

func isIgnoredPath(path string, ignore []string) bool {
	if path == "" || len(ignore) == 0 {
		return false
	}
	for _, p := range ignore {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// Support exact matches and simple prefix globs like "/health*"
		if strings.HasSuffix(p, "*") {
			if strings.HasPrefix(path, strings.TrimSuffix(p, "*")) {
				return true
			}
			continue
		}
		if path == p {
			return true
		}
	}
	return false
}

func parseLogLevel(s string) slog.Level {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func logBootInfo(logger *slog.Logger, cfg config.Config) {
	// Helper: one JSON log line per stat
	bootStat := func(name string, value any, extra ...any) {
		args := []any{
			slog.String("stat", name),
			slog.Any("value", value),
		}
		args = append(args, extra...)
		logger.Info("boot.stat", args...)
	}

	// --- Go version / build info ---
	buildInfo, ok := debug.ReadBuildInfo()
	goVersion := ""
	if ok {
		goVersion = buildInfo.GoVersion
	}
	bootStat("build.goversion", goVersion)

	// --- Effective runtime settings ---
	runtimeVer := runtime.Version()
	numCPU := runtime.NumCPU()

	// --- MemStats snapshot ---
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	// --- cgroup limits (v2 preferred, v1 fallback) ---
	memMaxRaw := readFirstExisting(
		"/sys/fs/cgroup/memory.max",                   // cgroup v2
		"/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
	)
	cpuMaxRaw := readFirstExisting("/sys/fs/cgroup/cpu.max") // cgroup v2

	// cgroup v1 CPU quota/period
	cpuQuotaRawV1 := readFirstExisting("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
	cpuPeriodRawV1 := readFirstExisting("/sys/fs/cgroup/cpu/cpu.cfs_period_us")

	// Parse CPU limits into something meaningful
	cpuInfo := parseCgroupCPU(cpuMaxRaw, cpuQuotaRawV1, cpuPeriodRawV1)

	// --- Emit: one stat per JSON message ---
	bootStat("runtime.goversion", runtimeVer)

	bootStat("config.env", cfg.DeploymentEnv)
	bootStat("config.port", cfg.Port)

	bootStat("otel.endpoint", cfg.OtelEndpoint)
	bootStat("otel.http.traces_mode", cfg.HTTPTracesMode)
	bootStat("otel.http.enabled", cfg.HTTPMiddlewareEnabled)

	gogcEff, memLimitEffBytes, gomaxprocsEff, err := readRuntimeKnobs()
	if err != nil {
		logger.Warn("boot.runtime.knobs unavailable", slog.Any("err", err))
	} else {
		bootStat("runtime.gogc.effective", gogcEff)
		bootStat("runtime.gomemlimit.effective", bytesToMBOrUnlimited(memLimitEffBytes), slog.Uint64("bytes", memLimitEffBytes))
		bootStat("runtime.gomaxprocs.effective", gomaxprocsEff)
	}

	bootStat("runtime.numcpu.visible", numCPU)
	bootStat("runtime.goroutines", runtime.NumGoroutine())

	// Env knobs
	bootStat("env.GOMAXPROCS", os.Getenv("GOMAXPROCS"), slog.Bool("set", os.Getenv("GOMAXPROCS") != ""))
	bootStat("env.GOGC", os.Getenv("GOGC"), slog.Bool("set", os.Getenv("GOGC") != ""))
	bootStat("env.GOMEMLIMIT", os.Getenv("GOMEMLIMIT"), slog.Bool("set", os.Getenv("GOMEMLIMIT") != ""))
	bootStat("env.GODEBUG", os.Getenv("GODEBUG"), slog.Bool("set", os.Getenv("GODEBUG") != ""))
	bootStat("env.CACHE_IMPL", os.Getenv("CACHE_IMPL"))
	bootStat("env.CACHE_SIZE", os.Getenv("CACHE_SIZE"))

	// MemStats: each field separately, as MB
	bootStat("memstats.heap_alloc", formatBytes(ms.HeapAlloc))
	bootStat("memstats.heap_sys", formatBytes(ms.HeapSys))
	bootStat("memstats.heap_idle", formatBytes(ms.HeapIdle))
	bootStat("memstats.heap_released", formatBytes(ms.HeapReleased))
	bootStat("memstats.stack_inuse", formatBytes(ms.StackInuse))

	bootStat("memstats.gc.num", uint64(ms.NumGC))
	bootStat("memstats.gc.pause_total_ms", float64(ms.PauseTotalNs)/1e6, slog.String("unit", "ms"))

	// cgroup memory: try to parse numeric → MB, otherwise keep raw ("max")
	bootStat("cgroup.memory.max_raw", strings.TrimSpace(memMaxRaw))
	if mb, ok := parseCgroupMemToMB(memMaxRaw); ok {
		bootStat("cgroup.memory.max", mb)
	}

	// cgroup cpu: raw + quota/period + derived ratio
	bootStat("cgroup.cpu.max_raw", strings.TrimSpace(cpuMaxRaw))

	if cpuInfo.HasQuotaPeriod {
		bootStat("cgroup.cpu.source", cpuInfo.Source)

		bootStat("cgroup.cpu.quota", cpuInfo.QuotaUS, slog.String("unit", "us"))
		bootStat("cgroup.cpu.period", cpuInfo.PeriodUS, slog.String("unit", "us"))

		// This is the meaningful interpretation of cpu.max: quota/period (== CPUs)
		bootStat("cgroup.cpu.quota_div_period", cpuInfo.QuotaDivPeriod)
		bootStat("cgroup.cpu.cpus", cpuInfo.CPUs)
	} else {
		bootStat("cgroup.cpu.source", "")
		bootStat("cgroup.cpu.quota", "", slog.Bool("set", false))
		bootStat("cgroup.cpu.period", "", slog.Bool("set", false))
		bootStat("cgroup.cpu.quota_div_period", "")
		bootStat("cgroup.cpu.cpus", "")
	}
}

func readRuntimeKnobs() (gogc uint64, gomemlimit uint64, gomaxprocs uint64, err error) {
	samples := []metrics.Sample{
		{Name: "/gc/gogc:percent"},
		{Name: "/gc/gomemlimit:bytes"},
		{Name: "/sched/gomaxprocs:threads"},
	}

	metrics.Read(samples)

	//for _, d := range metrics.All() {
	//	fmt.Println(d.Name, "-", d.Description)
	//}

	// Validate kinds (defensive: if a metric name is unknown in your Go version, it will come back as KindBad).
	if samples[0].Value.Kind() == metrics.KindBad ||
		samples[1].Value.Kind() == metrics.KindBad ||
		samples[2].Value.Kind() == metrics.KindBad {
		return 0, 0, 0, fmt.Errorf("one or more runtime metrics are unavailable (bad kind); check Go version/metric names")
	}

	return samples[0].Value.Uint64(),
		samples[1].Value.Uint64(),
		samples[2].Value.Uint64(),
		nil
}

func bytesToMBOrUnlimited(v uint64) any {
	if v <= 0 {
		return "unknown"
	}
	if v > (1 << 60) { // heuristic: huge = unlimited
		return "unlimited"
	}
	return formatBytes(v)
}

func toFixed2(f float64) float64 {
	// Keep stable JSON numbers like 123.45 (not 123.4500000003)
	return math.Round(f*100) / 100
}

type cgroupCPUInfo struct {
	Source         string // "cgv2" | "cgv1" | ""
	QuotaUS        int64
	PeriodUS       int64
	QuotaDivPeriod any // float64 (e.g. 4.0) or "unlimited" or ""
	CPUs           any // same as QuotaDivPeriod; kept for readability
	HasQuotaPeriod bool
}

// parseCgroupCPU prefers cgroup v2 cpu.max if present; falls back to v1 quota/period.
func parseCgroupCPU(cpuMaxRaw, quotaRawV1, periodRawV1 string) cgroupCPUInfo {
	// cgroup v2: "<quota> <period>" OR "max <period>"
	cpuMaxRaw = strings.TrimSpace(cpuMaxRaw)
	if cpuMaxRaw != "" {
		parts := strings.Fields(cpuMaxRaw)
		if len(parts) == 2 {
			period, pErr := strconv.ParseInt(parts[1], 10, 64)
			if parts[0] == "max" && pErr == nil && period > 0 {
				return cgroupCPUInfo{
					Source:         "cgv2",
					QuotaUS:        -1,
					PeriodUS:       period,
					QuotaDivPeriod: "unlimited",
					CPUs:           "unlimited",
					HasQuotaPeriod: true,
				}
			}

			quota, qErr := strconv.ParseInt(parts[0], 10, 64)
			if qErr == nil && pErr == nil && quota > 0 && period > 0 {
				r := toFixed2(float64(quota) / float64(period))
				return cgroupCPUInfo{
					Source:         "cgv2",
					QuotaUS:        quota,
					PeriodUS:       period,
					QuotaDivPeriod: r,
					CPUs:           r,
					HasQuotaPeriod: true,
				}
			}
		}
	}

	// cgroup v1: quota/period
	quotaRawV1 = strings.TrimSpace(quotaRawV1)
	periodRawV1 = strings.TrimSpace(periodRawV1)
	quota, qErr := strconv.ParseInt(quotaRawV1, 10, 64)
	period, pErr := strconv.ParseInt(periodRawV1, 10, 64)

	if qErr == nil && pErr == nil && period > 0 {
		if quota < 0 {
			return cgroupCPUInfo{
				Source:         "cgv1",
				QuotaUS:        quota,
				PeriodUS:       period,
				QuotaDivPeriod: "unlimited",
				CPUs:           "unlimited",
				HasQuotaPeriod: true,
			}
		}
		if quota > 0 {
			r := toFixed2(float64(quota) / float64(period))
			return cgroupCPUInfo{
				Source:         "cgv1",
				QuotaUS:        quota,
				PeriodUS:       period,
				QuotaDivPeriod: r,
				CPUs:           r,
				HasQuotaPeriod: true,
			}
		}
	}

	return cgroupCPUInfo{}
}

func parseCgroupMemToMB(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "max" {
		return "0", false
	}
	v, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || v <= 0 {
		return "0", false
	}
	formatted := formatBytes(v)
	return formatted, true
}

func readFirstExisting(paths ...string) string {
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

func formatBytes(b uint64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)
	format := func(val float64) string {
		s := strconv.FormatFloat(val, 'f', 2, 64)
		// Drop decimals when they're all zeros (e.g. "1.00" -> "1")
		if strings.HasSuffix(s, ".00") {
			return s[:len(s)-3]
		}
		return s
	}
	switch {
	case b >= GB:
		return format(float64(b)/GB) + "GB"
	case b >= MB:
		return format(float64(b)/MB) + "MB"
	case b >= KB:
		return format(float64(b)/KB) + "KB"
	default:
		return strconv.FormatUint(b, 10) + "B"
	}
}
