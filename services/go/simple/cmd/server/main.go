package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"runtime"
	"runtime/debug"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/metric"

	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/trace"

	_ "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"google.golang.org/grpc"
)

var numberCache map[int]int

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
		otlpmetricgrpc.WithDialOption(grpc.WithBlock()),
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

func initTracerProvider(ctx context.Context) (*trace.TracerProvider, error) {
	exporter, err := otlptracegrpc.New(ctx,
		otlptracegrpc.WithInsecure(),
		otlptracegrpc.WithEndpoint(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")),
	)
	if err != nil {
		return nil, err
	}

	tp := trace.NewTracerProvider(
		trace.WithBatcher(exporter),
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

func main() {
	logGoVersion()
	ctx := context.Background()

	initNumberCache(50000)

	// Initialize metrics
	mp, err := initMeterProvider(ctx)
	if err != nil {
		log.Fatalf("failed to init meter provider: %v", err)
	}
	defer func() { _ = mp.Shutdown(ctx) }()

	// Initialize tracing
	tp, err := initTracerProvider(ctx)
	if err != nil {
		log.Fatalf("failed to init tracer provider: %v", err)
	}
	defer func() { _ = tp.Shutdown(ctx) }()

	// Create instruments
	meter := otel.Meter("go-hello-fiber")
	counter, _ := meter.Int64Counter("hello.request.count")
	tracer := otel.Tracer("go-hello-fiber")

	// Fiber app
	app := fiber.New()

	app.Get("/hello/virtual", func(c *fiber.Ctx) error {
		// Start a span for tracing
		reqCtx, span := tracer.Start(c.Context(), "hello-handler")
		defer span.End()

		// Record metric
		counter.Add(reqCtx, 1, metric.WithAttributes(attribute.String("endpoint", "/hello/virtual")))

		value, ok := numberCache[1]
		if !ok {
			return c.Status(fiber.StatusNotFound).SendString("value not found")
		}
		return c.SendString(fmt.Sprintf("Hello from GO-simple REST %v", value))
	})

	port := ":8080"
	fmt.Printf("Fiber server running on %s\n", port)
	if err := app.Listen(port); err != nil {
		log.Fatal(err)
	}
}
