// Package main implements the Go simple REST service for benchmarking.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"runtime/debug"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

const (
	defaultCacheSize = 50000
	defaultPort      = ":8080"
	helloEndpoint    = "/hello/virtual"
	requestCounter   = "hello.request.count"
	serviceName      = "go-simple"
)

var numberCache map[int]int

var (
	meterProviderInit  = initMeterProvider
	tracerProviderInit = initTracerProvider
	appListener        = func(app *fiber.App, port string) error {
		fmt.Printf("Fiber server running on %s\n", port)
		return app.Listen(port)
	}
)

func initNumberCache(size int) {
	numberCache = make(map[int]int, size)
	for i := size; i > 0; i-- {
		numberCache[i] = i
	}
}

func initMeterProvider(ctx context.Context) (*sdkmetric.MeterProvider, error) {
	// Exporter will read OTEL_EXPORTER_OTLP_ENDPOINT from env
	exporter, err := otlpmetricgrpc.New(ctx,
		otlpmetricgrpc.WithInsecure(),
		otlpmetricgrpc.WithEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
	)
	if err != nil {
		return nil, err
	}

	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter,
			sdkmetric.WithInterval(5*time.Second))),
	)
	otel.SetMeterProvider(provider)
	return provider, nil
}

func initTracerProvider(ctx context.Context) (*sdktrace.TracerProvider, error) {
	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithInsecure(),
		otlptracegrpc.WithEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
	)
	otel.SetTracerProvider(tp)
	return tp, nil
}

func logGoVersion() {
	runtimeVer := runtime.Version()
	buildInfo, ok := debug.ReadBuildInfo()
	if ok {
		log.Printf("Runtime version: %s | Build version: %s", runtimeVer, buildInfo.GoVersion)
	} else {
		log.Printf("Runtime version: %s | Build info not available", runtimeVer)
	}
}

func resolvePort() string {
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		return defaultPort
	}
	if strings.HasPrefix(port, ":") {
		return port
	}
	return ":" + port
}

func newApp(counter metric.Int64Counter, tracer oteltrace.Tracer) *fiber.App {
	app := fiber.New()

	app.Get(helloEndpoint, func(c fiber.Ctx) error {
		// Start a span for tracing
		reqCtx, span := tracer.Start(c.RequestCtx(), "hello-handler")
		defer span.End()

		// Record metric
		counter.Add(reqCtx, 1, metric.WithAttributes(attribute.String("endpoint", helloEndpoint)))

		value, ok := numberCache[1]
		if !ok {
			return c.Status(fiber.StatusNotFound).SendString("value not found")
		}
		return c.SendString(fmt.Sprintf("Hello from GO-simple REST %v", value))
	})

	return app
}

func runWithContext(ctx context.Context) error {
	logGoVersion()

	initNumberCache(defaultCacheSize)

	// Initialize metrics
	mp, err := meterProviderInit(ctx)
	if err != nil {
		return fmt.Errorf("init meter provider: %w", err)
	}
	defer func() { _ = mp.Shutdown(ctx) }()

	// Initialize tracing
	tp, err := tracerProviderInit(ctx)
	if err != nil {
		return fmt.Errorf("init tracer provider: %w", err)
	}
	defer func() { _ = tp.Shutdown(ctx) }()

	// Create instruments
	meter := otel.Meter(serviceName)
	counter, err := meter.Int64Counter(requestCounter)
	if err != nil {
		return fmt.Errorf("create request counter: %w", err)
	}
	tracer := otel.Tracer(serviceName)

	return appListener(newApp(counter, tracer), resolvePort())
}

func run() error {
	return runWithContext(context.Background())
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
