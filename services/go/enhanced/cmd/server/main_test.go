package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"hello/internal/config"

	"github.com/gofiber/fiber/v3"
	otelapi "go.opentelemetry.io/otel"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestSetupHTTPInstrumentation(t *testing.T) {
	cases := []struct {
		name        string
		enabled     bool
		traces      bool
		metrics     bool
		propagation bool
		ignore      []string
		wantSpans   int
		wantMetrics bool
	}{
		{name: "disabled", traces: true, metrics: true, propagation: true},
		{name: "signals disabled", enabled: true},
		{name: "traces only", enabled: true, traces: true, propagation: true, wantSpans: 1},
		{name: "metrics only", enabled: true, metrics: true, propagation: true, wantMetrics: true},
		{name: "both signals", enabled: true, traces: true, metrics: true, propagation: true, wantSpans: 1, wantMetrics: true},
		{name: "propagation disabled", enabled: true, traces: true, metrics: true, wantSpans: 1, wantMetrics: true},
		{name: "exact ignored path", enabled: true, traces: true, metrics: true, propagation: true, ignore: []string{" /hello/virtual ", "", "   "}},
		{name: "glob ignored path", enabled: true, traces: true, metrics: true, propagation: true, ignore: []string{" /hello/* "}},
	}

	for _, mode := range []string{"otelfiber", "minimal"} {
		for _, tc := range cases {
			t.Run(mode+"/"+tc.name, func(t *testing.T) {
				cfg := config.Config{
					Port:                   8080,
					HTTPMiddlewareEnabled:  tc.enabled,
					HTTPTracesEnabled:      tc.traces,
					HTTPMetricsEnabled:     tc.metrics,
					HTTPPropagationEnabled: tc.propagation,
					HTTPIgnorePaths:        tc.ignore,
					HTTPTracesMode:         mode,
					HTTPSpanNameMode:       "constant",
				}
				testHTTPInstrumentation(t, cfg, tc.wantSpans, tc.wantMetrics)
			})
		}
	}
}

func testHTTPInstrumentation(t *testing.T, cfg config.Config, wantSpans int, wantMetrics bool) {
	t.Helper()
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	reader := sdkmetric.NewManualReader()
	mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	previousTracer := otelapi.GetTracerProvider()
	previousMeter := otelapi.GetMeterProvider()
	otelapi.SetTracerProvider(tp)
	otelapi.SetMeterProvider(mp)
	t.Cleanup(func() {
		otelapi.SetTracerProvider(previousTracer)
		otelapi.SetMeterProvider(previousMeter)
		if err := tp.Shutdown(context.Background()); err != nil {
			t.Errorf("tracer shutdown: %v", err)
		}
		if err := mp.Shutdown(context.Background()); err != nil {
			t.Errorf("meter shutdown: %v", err)
		}
	})

	app := fiber.New()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := setupHTTPInstrumentation(app, cfg, logger); err != nil {
		t.Fatalf("setupHTTPInstrumentation: %v", err)
	}
	app.Get("/hello/virtual", func(c fiber.Ctx) error {
		return c.SendString("hello virtual")
	})
	req := httptest.NewRequest(http.MethodGet, "/hello/virtual", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if resp.StatusCode != http.StatusOK || string(body) != "hello virtual" {
		t.Fatalf("unexpected response: status=%d body=%q", resp.StatusCode, body)
	}

	assertHTTPSpans(t, recorder.Ended(), wantSpans, cfg.HTTPPropagationEnabled)
	var collected metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &collected); err != nil {
		t.Fatalf("collect metrics: %v", err)
	}
	if gotMetrics := len(collected.ScopeMetrics) > 0; gotMetrics != wantMetrics {
		t.Fatalf("HTTP metrics present = %v, want %v", gotMetrics, wantMetrics)
	}
}

func assertHTTPSpans(t *testing.T, spans []sdktrace.ReadOnlySpan, wantSpans int, propagationEnabled bool) {
	t.Helper()
	if len(spans) != wantSpans {
		t.Fatalf("recorded %d spans, want %d", len(spans), wantSpans)
	}
	for _, span := range spans {
		if span.Name() != "http.request" {
			t.Errorf("span name = %q, want http.request", span.Name())
		}
		if span.Parent().IsValid() != propagationEnabled {
			t.Errorf("parent validity = %v, want %v", span.Parent().IsValid(), propagationEnabled)
		}
		if propagationEnabled && span.Parent().SpanID().String() != "00f067aa0ba902b7" {
			t.Errorf("unexpected parent span: %s", span.Parent().SpanID())
		}
	}
}

func TestSetupHTTPInstrumentationInvalidMode(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.Config{HTTPMiddlewareEnabled: true, HTTPTracesMode: "invalid"}
	err := setupHTTPInstrumentation(fiber.New(), cfg, logger)
	if err == nil || err.Error() != "invalid OTEL_HTTP_TRACES_MODE" {
		t.Fatalf("expected invalid mode error, got %v", err)
	}

	cfg.HTTPMiddlewareEnabled = false
	if err := setupHTTPInstrumentation(fiber.New(), cfg, logger); err != nil {
		t.Fatalf("disabled instrumentation should bypass mode selection: %v", err)
	}
}
