package handlers

import (
	"bytes"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hello/internal/cache"

	"github.com/gofiber/fiber/v2"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	tracenoop "go.opentelemetry.io/otel/trace/noop"
)

func newTestLogger(buf io.Writer) *slog.Logger {
	// Use INFO so we don't accidentally capture debug-only internal logs and fail assertions.
	h := slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(h)
}

func newTestApp(t *testing.T, buf *bytes.Buffer) *fiber.App {
	t.Helper()

	app := fiber.New()

	c, err := cache.New(10, "map")
	if err != nil {
		t.Fatalf("cache.New: %v", err)
	}

	// Use noop OTel providers for deterministic tests (no global provider dependency).
	mp := metricnoop.NewMeterProvider()
	tp := tracenoop.NewTracerProvider()

	spansEnabled := false
	h, err := NewHelloHandler(HelloHandlerOpts{
		Cache:        c,
		Logger:       newTestLogger(buf),
		Meter:        mp.Meter("test"),
		Tracer:       tp.Tracer("test"),
		SpansEnabled: &spansEnabled,
	})
	if err != nil {
		t.Fatalf("NewHelloHandler: %v", err)
	}
	app.Get("/hello/virtual", h.Virtual)
	return app
}

func TestVirtual_Defaults(t *testing.T) {
	var buf bytes.Buffer
	app := newTestApp(t, &buf)

	req := httptest.NewRequest("GET", "/hello/virtual", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	// No log output unless log=true.
	if strings.Contains(buf.String(), "goroutine thread") {
		t.Fatalf("did not expect log output; got: %s", buf.String())
	}
}

func TestVirtual_LogEnabled(t *testing.T) {
	var buf bytes.Buffer
	app := newTestApp(t, &buf)

	req := httptest.NewRequest("GET", "/hello/virtual?log=true", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(buf.String(), "goroutine thread") {
		t.Fatalf("expected log to contain 'goroutine thread', got: %s", buf.String())
	}
}

func TestVirtual_Sleep(t *testing.T) {
	var buf bytes.Buffer
	app := newTestApp(t, &buf)

	start := time.Now()
	req := httptest.NewRequest("GET", "/hello/virtual?sleep=1", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	elapsed := time.Since(start)
	// Be tolerant of scheduling/CI noise; the handler sleeps for 1 second.
	if elapsed < 900*time.Millisecond {
		t.Fatalf("expected ~1s sleep, got %v", elapsed)
	}
}

func TestVirtual_BadParams(t *testing.T) {
	var buf bytes.Buffer
	app := newTestApp(t, &buf)

	for _, url := range []string{
		"/hello/virtual?log=notabool",
		"/hello/virtual?sleep=notanint",
		"/hello/virtual?sleep=-1",
	} {
		req := httptest.NewRequest("GET", url, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("app.Test (%s): %v", url, err)
		}
		if resp.StatusCode != 400 {
			t.Fatalf("expected 400 for %s, got %d", url, resp.StatusCode)
		}
	}
}
