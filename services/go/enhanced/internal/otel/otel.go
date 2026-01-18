package otel

import (
	"context"
	"crypto/tls"
	"fmt"
	"hello/internal/buildinfo"
	"hello/internal/config"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"time"

	otelpyroscope "github.com/grafana/otel-profiling-go"
	"github.com/grafana/pyroscope-go"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	runtimemetrics "go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	grpcinsecure "google.golang.org/grpc/credentials/insecure"
)

// Telemetry holds optional integrations created during Setup.
type Telemetry struct {
	Enabled        bool
	OtelLogHandler slog.Handler // nil unless OTEL_LOGS_ENABLED=true
	Shutdown       func(ctx context.Context) error
}

// Setup configures OpenTelemetry (traces + metrics, optional logs) and optional Pyroscope span profiles.
// If OTEL_EXPORTER_OTLP_ENDPOINT is empty, providers remain no-op.
func Setup(ctx context.Context, cfg config.Config, baseLogger *slog.Logger) (*Telemetry, error) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	serviceName := strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME"))
	if serviceName == "" {
		serviceName = "go"
	}

	res, err := resource.New(ctx,
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithOS(),
		resource.WithProcess(),
		resource.WithContainer(),
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String(buildinfo.Version),
			attribute.String("service.instance.id", strings.TrimSpace(os.Getenv("HOSTNAME"))),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create resource: %w", err)
	}

	if strings.TrimSpace(cfg.OtelEndpoint) == "" {
		return &Telemetry{Enabled: false, Shutdown: func(context.Context) error { return nil }}, nil
	}

	isURL, endpoint, err := parseEndpoint(cfg.OtelEndpoint)
	if err != nil {
		return nil, err
	}

	// ---- Shared gRPC connection (one conn for traces+metrics+logs) ----
	target, err := grpcTarget(isURL, endpoint)
	if err != nil {
		return nil, err
	}
	conn, err := newOTLPConn(target, cfg.OtelInsecure)
	if err != nil {
		return nil, err
	}

	shutdowns := make([]func(context.Context) error, 0, 6)
	shutdowns = append(shutdowns, func(context.Context) error { return conn.Close() })

	// ---- Traces ----
	traceExp, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, fmt.Errorf("create trace exporter: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithSampler(traceSampler(cfg)),
		sdktrace.WithBatcher(traceExp,
			sdktrace.WithMaxQueueSize(8192),
			sdktrace.WithMaxExportBatchSize(1024),
			sdktrace.WithBatchTimeout(1*time.Second),
		),
	)

	shutdowns = append(shutdowns, func(ctx context.Context) error { return tp.Shutdown(ctx) })

	// Optional Span Profiles (Pyroscope + otel-profiling-go)
	if cfg.PyroscopeEnabled && cfg.PyroscopeServerAddress != "" && cfg.PyroscopeApplicationName != "" {
		var pyLogger pyroscope.Logger
		switch strings.ToLower(strings.TrimSpace(cfg.PyroscopeLogLevel)) {
		case "off", "none", "false", "0":
			pyLogger = nil // pyroscope-go treats nil as "no logging"
		default:
			// pyroscope-go doesn't provide a proper level filter; StandardLogger prints DEBUG too.
			// Prefer nil in performance benchmarks, and enable logs only when debugging.
			pyLogger = pyroscope.StandardLogger
		}

		prof, err := pyroscope.Start(pyroscope.Config{
			ApplicationName: cfg.PyroscopeApplicationName,
			ServerAddress:   cfg.PyroscopeServerAddress,
			Logger:          pyLogger,
			ProfileTypes:    profileTypes(cfg.PyroscopeProfileTypes),
			UploadRate:      cfg.PyroscopeUploadInterval,
		})
		if err != nil {
			baseLogger.Warn("pyroscope start failed", slog.Any("err", err))
			otel.SetTracerProvider(tp)
		} else {
			shutdowns = append(shutdowns, func(context.Context) error { return prof.Stop() })
			otel.SetTracerProvider(otelpyroscope.NewTracerProvider(tp))
		}
	} else {
		otel.SetTracerProvider(tp)
	}

	// ---- Metrics ----
	if !cfg.MetricsEnabled || cfg.MetricsExportInterval <= 0 {
		otel.SetMeterProvider(noop.NewMeterProvider())
	} else {
		metricExp, err := otlpmetricgrpc.New(ctx, otlpmetricgrpc.WithGRPCConn(conn))
		if err != nil {
			return nil, fmt.Errorf("create metric exporter: %w", err)
		}

		readerOpts := []sdkmetric.PeriodicReaderOption{
			sdkmetric.WithInterval(cfg.MetricsExportInterval),
		}
		// Go scheduling latency histogram is opt-in because it can add overhead.
		if cfg.GoScheduleMetricsEnabled {
			readerOpts = append(readerOpts, sdkmetric.WithProducer(runtimemetrics.NewProducer()))
		}

		reader := sdkmetric.NewPeriodicReader(metricExp, readerOpts...)

		mp := sdkmetric.NewMeterProvider(
			sdkmetric.WithResource(res),
			sdkmetric.WithReader(reader),
		)

		otel.SetMeterProvider(mp)
		shutdowns = append(shutdowns, func(ctx context.Context) error { return mp.Shutdown(ctx) })

		if cfg.RuntimeMetricsEnabled {
			if err := runtimemetrics.Start(runtimemetrics.WithMeterProvider(mp)); err != nil {
				baseLogger.Warn("runtime metrics start failed", slog.Any("err", err))
			}
		}
	}

	// ---- Logs (optional, experimental) ----
	var otelHandler slog.Handler
	if cfg.LogsEnabled {
		logExp, err := otlploggrpc.New(ctx, otlploggrpc.WithGRPCConn(conn))
		if err != nil {
			return nil, fmt.Errorf("create log exporter: %w", err)
		}
		lp := sdklog.NewLoggerProvider(
			sdklog.WithResource(res),
			sdklog.WithProcessor(sdklog.NewBatchProcessor(logExp)),
		)
		global.SetLoggerProvider(lp)
		shutdowns = append(shutdowns, func(ctx context.Context) error { return lp.Shutdown(ctx) })

		// Bridge slog -> OpenTelemetry logs
		otelHandler = otelslog.NewHandler(serviceName, otelslog.WithLoggerProvider(lp))
	}

	return &Telemetry{
		Enabled:        true,
		OtelLogHandler: otelHandler,
		Shutdown: func(ctx context.Context) error {
			for i := len(shutdowns) - 1; i >= 0; i-- {
				_ = shutdowns[i](ctx)
			}
			return nil
		},
	}, nil
}

func parseEndpoint(v string) (isURL bool, endpoint string, err error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return false, "", fmt.Errorf("empty OTLP endpoint")
	}
	if strings.Contains(v, "://") {
		u, err := url.Parse(v)
		if err != nil {
			return false, "", fmt.Errorf("invalid OTLP endpoint URL %q: %w", v, err)
		}
		if u.Host == "" {
			return false, "", fmt.Errorf("invalid OTLP endpoint URL %q: missing host", v)
		}
		return true, v, nil
	}
	return false, v, nil
}

func grpcTarget(isURL bool, endpoint string) (string, error) {
	if !isURL {
		return endpoint, nil
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid OTLP endpoint URL %q: %w", endpoint, err)
	}
	if u.Host == "" {
		return "", fmt.Errorf("invalid OTLP endpoint URL %q: missing host", endpoint)
	}
	return u.Host, nil
}

func newOTLPConn(target string, insecure bool) (*grpc.ClientConn, error) {
	dialOpts := make([]grpc.DialOption, 0, 2)
	if insecure {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(grpcinsecure.NewCredentials()))
	} else {
		dialOpts = append(dialOpts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{})))
	}

	// grpc.NewClient replaces grpc.Dial/grpc.DialContext (deprecated in newer grpc-go).
	// It returns a ClientConn that will connect on first use (no network I/O here).
	return grpc.NewClient(target, dialOpts...)
}

func traceSampler(cfg config.Config) sdktrace.Sampler {
	s := strings.ToLower(strings.TrimSpace(cfg.TracesSampler))
	arg := cfg.TracesSamplerArg
	switch s {
	case "", "parentbased_always_on":
		return sdktrace.ParentBased(sdktrace.AlwaysSample())
	case "parentbased_always_off":
		return sdktrace.ParentBased(sdktrace.NeverSample())
	case "always_on":
		return sdktrace.AlwaysSample()
	case "always_off":
		return sdktrace.NeverSample()
	case "traceidratio":
		return sdktrace.TraceIDRatioBased(clamp01(arg))
	case "parentbased_traceidratio":
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(clamp01(arg)))
	default:
		// Fail-safe: keep traces on rather than silently dropping them.
		return sdktrace.ParentBased(sdktrace.AlwaysSample())
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func profileTypes(names []string) []pyroscope.ProfileType {
	out := make([]pyroscope.ProfileType, 0, len(names))
	for _, n := range names {
		switch strings.ToLower(strings.TrimSpace(n)) {
		case "cpu":
			out = append(out, pyroscope.ProfileCPU)
		case "alloc":
			out = append(out, pyroscope.ProfileAllocSpace, pyroscope.ProfileAllocObjects)
		case "inuse":
			out = append(out, pyroscope.ProfileInuseSpace, pyroscope.ProfileInuseObjects)
		case "goroutines", "goroutine":
			out = append(out, pyroscope.ProfileGoroutines)
		case "mutex":
			out = append(out, pyroscope.ProfileMutexCount, pyroscope.ProfileMutexDuration)
		case "block":
			out = append(out, pyroscope.ProfileBlockCount, pyroscope.ProfileBlockDuration)
		}
	}
	if len(out) == 0 {
		out = []pyroscope.ProfileType{pyroscope.ProfileCPU}
	}
	return out
}

// Compile-time assertion that we import trace (used by downstream packages).
var _ trace.Span
