package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	tracenoop "go.opentelemetry.io/otel/trace/noop"
)

func newTestApp(t *testing.T) *fiber.App {
	t.Helper()

	initNumberCache(defaultCacheSize)
	meter := metricnoop.NewMeterProvider().Meter(serviceName)
	counter, err := meter.Int64Counter(requestCounter)
	if err != nil {
		t.Fatalf("meter.Int64Counter: %v", err)
	}

	return newApp(counter, tracenoop.NewTracerProvider().Tracer(serviceName))
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	return string(body)
}

func setEnv(t *testing.T, key string, value *string) {
	t.Helper()

	original, existed := os.LookupEnv(key)
	if value == nil {
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("Unsetenv(%s): %v", key, err)
		}
	} else if err := os.Setenv(key, *value); err != nil {
		t.Fatalf("Setenv(%s): %v", key, err)
	}

	t.Cleanup(func() {
		var err error
		if existed {
			err = os.Setenv(key, original)
		} else {
			err = os.Unsetenv(key)
		}
		if err != nil {
			t.Fatalf("restore env %s: %v", key, err)
		}
	})
}

func withRunHooks(
	t *testing.T,
	meterInit func(context.Context) (*sdkmetric.MeterProvider, error),
	tracerInit func(context.Context) (*sdktrace.TracerProvider, error),
	listener func(*fiber.App, string) error,
) {
	t.Helper()

	originalMeter := meterProviderInit
	originalTracer := tracerProviderInit
	originalListener := appListener

	meterProviderInit = meterInit
	tracerProviderInit = tracerInit
	appListener = listener

	t.Cleanup(func() {
		meterProviderInit = originalMeter
		tracerProviderInit = originalTracer
		appListener = originalListener
	})
}

func TestVirtualEndpoint(t *testing.T) {
	app := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, helloEndpoint, nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	body := readBody(t, resp)
	want := fmt.Sprintf("Hello from GO-simple REST %v", 1)
	if body != want {
		t.Fatalf("expected body %q, got %q", want, body)
	}
}

func TestVirtualEndpointWithCache(t *testing.T) {
	app := newTestApp(t)

	req := httptest.NewRequest(http.MethodGet, helloEndpoint, nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	if _, exists := numberCache[1]; !exists {
		t.Fatal("expected cache value to exist")
	}

	body := readBody(t, resp)
	if !strings.Contains(body, "GO-simple REST 1") {
		t.Fatalf("expected response to include cached value, got %q", body)
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
		t.Errorf("expected cache[1] = 1, got %d (exists: %v)", val, exists)
	}

	if val, exists := numberCache[size]; !exists || val != size {
		t.Errorf("expected cache[%d] = %d, got %d (exists: %v)", size, size, val, exists)
	}
}

func TestVirtualEndpointNotFound(t *testing.T) {
	meter := metricnoop.NewMeterProvider().Meter(serviceName)
	counter, err := meter.Int64Counter(requestCounter)
	if err != nil {
		t.Fatalf("meter.Int64Counter: %v", err)
	}

	numberCache = map[int]int{}
	app := newApp(counter, tracenoop.NewTracerProvider().Tracer(serviceName))

	req := httptest.NewRequest(http.MethodGet, helloEndpoint, nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.StatusCode)
	}
	if body := readBody(t, resp); body != "value not found" {
		t.Fatalf("expected not-found body, got %q", body)
	}
}

func TestResolvePort(t *testing.T) {
	setEnv(t, "PORT", nil)
	if got := resolvePort(); got != defaultPort {
		t.Fatalf("expected default port %q, got %q", defaultPort, got)
	}

	port := "9091"
	setEnv(t, "PORT", &port)
	if got := resolvePort(); got != ":9091" {
		t.Fatalf("expected normalized port %q, got %q", ":9091", got)
	}

	port = ":9092"
	setEnv(t, "PORT", &port)
	if got := resolvePort(); got != port {
		t.Fatalf("expected explicit port %q, got %q", port, got)
	}
}

func TestLogGoVersion(t *testing.T) {
	var buf bytes.Buffer
	originalWriter := log.Writer()
	originalFlags := log.Flags()
	originalPrefix := log.Prefix()

	log.SetOutput(&buf)
	log.SetFlags(0)
	log.SetPrefix("")
	t.Cleanup(func() {
		log.SetOutput(originalWriter)
		log.SetFlags(originalFlags)
		log.SetPrefix(originalPrefix)
	})

	logGoVersion()
	output := buf.String()
	if !strings.Contains(output, "Runtime version:") {
		t.Fatalf("expected runtime version log, got %q", output)
	}
	if !strings.Contains(output, "Build version:") && !strings.Contains(output, "Build info not available") {
		t.Fatalf("expected build info detail in log output, got %q", output)
	}
}

func TestRunWithContext(t *testing.T) {
	port := "9093"
	setEnv(t, "PORT", &port)

	withRunHooks(
		t,
		func(context.Context) (*sdkmetric.MeterProvider, error) {
			return sdkmetric.NewMeterProvider(), nil
		},
		func(context.Context) (*sdktrace.TracerProvider, error) {
			return sdktrace.NewTracerProvider(), nil
		},
		func(app *fiber.App, gotPort string) error {
			if gotPort != ":9093" {
				t.Fatalf("expected port %q, got %q", ":9093", gotPort)
			}

			resp, err := app.Test(httptest.NewRequest(http.MethodGet, helloEndpoint, nil))
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected status 200, got %d", resp.StatusCode)
			}
			return nil
		},
	)

	if err := runWithContext(context.Background()); err != nil {
		t.Fatalf("runWithContext: %v", err)
	}
}

func TestRun(t *testing.T) {
	port := "9094"
	setEnv(t, "PORT", &port)

	withRunHooks(
		t,
		func(context.Context) (*sdkmetric.MeterProvider, error) {
			return sdkmetric.NewMeterProvider(), nil
		},
		func(context.Context) (*sdktrace.TracerProvider, error) {
			return sdktrace.NewTracerProvider(), nil
		},
		func(app *fiber.App, gotPort string) error {
			if gotPort != ":9094" {
				t.Fatalf("expected port %q, got %q", ":9094", gotPort)
			}
			resp, err := app.Test(httptest.NewRequest(http.MethodGet, helloEndpoint, nil))
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected status 200, got %d", resp.StatusCode)
			}
			return nil
		},
	)

	if err := run(); err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestRunWithContextMeterProviderError(t *testing.T) {
	withRunHooks(
		t,
		func(context.Context) (*sdkmetric.MeterProvider, error) {
			return nil, errors.New("meter boom")
		},
		func(context.Context) (*sdktrace.TracerProvider, error) {
			t.Fatal("tracer provider should not be called when meter provider init fails")
			return nil, nil
		},
		func(*fiber.App, string) error {
			t.Fatal("listener should not be called when meter provider init fails")
			return nil
		},
	)

	err := runWithContext(context.Background())
	if err == nil || !strings.Contains(err.Error(), "init meter provider: meter boom") {
		t.Fatalf("expected wrapped meter provider error, got %v", err)
	}
}

func TestRunWithContextTracerProviderError(t *testing.T) {
	withRunHooks(
		t,
		func(context.Context) (*sdkmetric.MeterProvider, error) {
			return sdkmetric.NewMeterProvider(), nil
		},
		func(context.Context) (*sdktrace.TracerProvider, error) {
			return nil, errors.New("tracer boom")
		},
		func(*fiber.App, string) error {
			t.Fatal("listener should not be called when tracer provider init fails")
			return nil
		},
	)

	err := runWithContext(context.Background())
	if err == nil || !strings.Contains(err.Error(), "init tracer provider: tracer boom") {
		t.Fatalf("expected wrapped tracer provider error, got %v", err)
	}
}

func TestInitMeterProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	invalidEndpoint := "bad endpoint"
	setEnv(t, "OTEL_EXPORTER_OTLP_ENDPOINT", &invalidEndpoint)

	_, err := initMeterProvider(ctx)

	if err != nil {
		t.Logf("expected initMeterProvider error for invalid endpoint: %v", err)
	}
}

func TestInitMeterProviderSuccess(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	endpoint := "localhost:4317"
	setEnv(t, "OTEL_EXPORTER_OTLP_ENDPOINT", &endpoint)

	mp, err := initMeterProvider(ctx)
	if err != nil {
		t.Fatalf("initMeterProvider: %v", err)
	}
	if mp == nil {
		t.Fatal("expected meter provider")
	}
}

func TestInitTracerProvider(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	invalidEndpoint := "bad endpoint"
	setEnv(t, "OTEL_EXPORTER_OTLP_ENDPOINT", &invalidEndpoint)

	_, err := initTracerProvider(ctx)

	if err != nil {
		t.Logf("expected initTracerProvider error for invalid endpoint: %v", err)
	}
}

func TestInitTracerProviderSuccess(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	endpoint := "localhost:4317"
	setEnv(t, "OTEL_EXPORTER_OTLP_ENDPOINT", &endpoint)

	tp, err := initTracerProvider(ctx)
	if err != nil {
		t.Fatalf("initTracerProvider: %v", err)
	}
	if tp == nil {
		t.Fatal("expected tracer provider")
	}
}
