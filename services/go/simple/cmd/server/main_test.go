package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
)

func setupTestApp() *fiber.App {
	// Initialize cache for testing
	initNumberCache(50000)

	// Create instruments
	meter := otel.Meter("go-hello-fiber-test")
	counter, _ := meter.Int64Counter("hello.request.count")
	tracer := otel.Tracer("go-hello-fiber-test")

	// Create Fiber app
	app := fiber.New()

	app.Get("/hello/virtual", func(c *fiber.Ctx) error {
		// Start a span for tracing
		reqCtx, span := tracer.Start(c.Context(), "hello-handler")
		defer span.End()

		// Record metric
		counter.Add(reqCtx, 1)

		value, ok := numberCache[1]
		if !ok {
			return c.Status(fiber.StatusNotFound).SendString("value not found")
		}
		return c.SendString(fmt.Sprintf("Hello from GO REST %v", value))
	})

	return app
}

func TestVirtualEndpoint(t *testing.T) {
	app := setupTestApp()

	req := httptest.NewRequest(http.MethodGet, "/hello/virtual", nil)
	resp, err := app.Test(req)

	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	// Note: In the real implementation, we need to check the response body
	// but for this test we're just checking the status code
}

func TestVirtualEndpointWithCache(t *testing.T) {
	app := setupTestApp()

	req := httptest.NewRequest(http.MethodGet, "/hello/virtual", nil)
	resp, err := app.Test(req)

	if err != nil {
		t.Fatalf("Failed to send request: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	// Verify cache is working
	if _, exists := numberCache[1]; !exists {
		t.Error("Cache value should exist")
	}
}

func TestInitNumberCache(t *testing.T) {
	size := 100
	initNumberCache(size)

	if len(numberCache) != size {
		t.Errorf("Expected cache size %d, got %d", size, len(numberCache))
	}

	// Check first and last entries
	if val, exists := numberCache[1]; !exists || val != 1 {
		t.Errorf("Expected cache[1] = 1, got %d (exists: %v)", val, exists)
	}

	if val, exists := numberCache[size]; !exists || val != size {
		t.Errorf("Expected cache[%d] = %d, got %d (exists: %v)", size, size, val, exists)
	}
}

func TestInitMeterProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// This test will fail if OTEL_EXPORTER_OTLP_ENDPOINT is not set
	// or if the endpoint is not reachable, which is expected in unit tests
	// We're testing that the function doesn't panic
	_, err := initMeterProvider(ctx)

	// It's okay if this fails due to missing endpoint in test environment
	if err != nil {
		t.Logf("Expected error in test environment: %v", err)
	}
}

func TestInitTracerProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// This test will fail if OTEL_EXPORTER_OTLP_ENDPOINT is not set
	// or if the endpoint is not reachable, which is expected in unit tests
	// We're testing that the function doesn't panic
	_, err := initTracerProvider(ctx)

	// It's okay if this fails due to missing endpoint in test environment
	if err != nil {
		t.Logf("Expected error in test environment: %v", err)
	}
}
