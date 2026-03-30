// Package main is the entry point for the enhanced Go REST service.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"hello/internal/boot"
	"hello/internal/cache"
	"hello/internal/config"
	"hello/internal/handlers"
	"hello/internal/logging"
	"hello/internal/middleware"
	appotel "hello/internal/otel"

	otelfiber "github.com/gofiber/contrib/v3/otel"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"go.opentelemetry.io/otel/propagation"

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

	bootstrapLogger := logging.NewJSONLogger(boot.ParseLogLevel(cfg.LogLevel)).With(slog.String("service", serviceName))

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
			slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: boot.ParseLogLevel(cfg.LogLevel)}),
		)
		logger = slog.New(logging.NewMultiHandler(stdoutHandler, tel.OtelLogHandler))
	}

	slog.SetDefault(logger)

	boot.LogBootInfo(logger, cfg)

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

	// ---------- Fiber: tuned for max throughput on 2 vCPUs ----------
	app := fiber.New(fiber.Config{
		ReadTimeout:               10 * time.Second,
		WriteTimeout:              10 * time.Second,
		IdleTimeout:               60 * time.Second,
		DisableDefaultContentType: true, // skip auto Content-Type header
		DisableHeaderNormalizing:  true, // avoid per-request header case normalization
		StreamRequestBody:         true, // avoid buffering request bodies
	})

	app.Use(recover.New())

	// ---- HTTP instrumentation ----
	if cfg.HTTPMiddlewareEnabled {
		spanNameFn := middleware.MakeSpanNameFormatter(cfg.HTTPSpanNameMode)

		// Pre-normalize ignored paths once.
		ignorePaths := middleware.NormalizePaths(cfg.HTTPIgnorePaths)

		// For performance, we default to TraceContext only (no baggage).
		var propagators propagation.TextMapPropagator
		if cfg.HTTPPropagationEnabled {
			propagators = propagation.TraceContext{}
		} else {
			propagators = propagation.NewCompositeTextMapPropagator()
		}

		switch cfg.HTTPTracesMode {
		case "otelfiber":
			opts := []otelfiber.Option{
				otelfiber.WithPort(cfg.Port),
				otelfiber.WithNext(func(c fiber.Ctx) bool {
					return middleware.IsIgnoredPath(c.Path(), ignorePaths)
				}),
				otelfiber.WithClientIP(cfg.HTTPCollectClientIP),
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
			if cfg.HTTPTracesEnabled {
				app.Use(middleware.MinimalHTTPTracingMiddleware(
					otelapi.Tracer(instrumentationName),
					spanNameFn,
					propagators,
					ignorePaths,
				))
			} else {
				logger.Info("http tracing disabled (OTEL_HTTP_TRACES_ENABLED=false)")
			}

			if cfg.HTTPMetricsEnabled {
				opts := []otelfiber.Option{
					otelfiber.WithPort(cfg.Port),
					otelfiber.WithNext(func(c fiber.Ctx) bool {
						return middleware.IsIgnoredPath(c.Path(), ignorePaths)
					}),
					otelfiber.WithClientIP(cfg.HTTPCollectClientIP),
					otelfiber.WithSpanNameFormatter(spanNameFn),
					otelfiber.WithPropagators(propagators),
					otelfiber.WithTracerProvider(tracenoop.NewTracerProvider()),
				}
				app.Use(otelfiber.Middleware(opts...))
			}

		default:
			logger.Error("invalid OTEL_HTTP_TRACES_MODE", slog.String("mode", cfg.HTTPTracesMode))
			os.Exit(1)
		}
	} else {
		logger.Info("http instrumentation disabled (OTEL_HTTP_ENABLED=false)")
	}

	// Lightweight liveness/readiness endpoints
	app.Get("/healthz", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Get("/readyz", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })
	app.Get("/livez", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

	// Main endpoint
	app.Get("/hello/virtual", h.Virtual)

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	logger.Info("starting server", slog.String("addr", addr), slog.String("otlp", cfg.OtelEndpoint))

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- app.Listen(addr, fiber.ListenConfig{DisableStartupMessage: false})
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
	_ = c.Close()
}
