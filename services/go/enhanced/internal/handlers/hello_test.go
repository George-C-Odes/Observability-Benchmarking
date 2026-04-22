package handlers

import (
	"bytes"
	"io"
	"log/slog"
	"math"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"hello/internal/cache"

	"github.com/gofiber/fiber/v3"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	tracenoop "go.opentelemetry.io/otel/trace/noop"
)

type stubCache struct {
	value string
	ok    bool
}

func (s stubCache) Get(string) (string, bool) { return s.value, s.ok }
func (s stubCache) Size() int                 { return 1 }
func (s stubCache) Close() error              { return nil }

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

	// Verify JSON content type.
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Fatalf("expected Content-Type application/json, got %q", ct)
	}

	// Verify JSON-quoted body.
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	if !strings.Contains(bodyStr, "Hello from GO REST") {
		t.Fatalf("expected body to contain 'Hello from GO REST', got: %s", bodyStr)
	}
	if bodyStr[0] != '"' || bodyStr[len(bodyStr)-1] != '"' {
		t.Fatalf("expected JSON-quoted string, got: %s", bodyStr)
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
	resp, err := app.Test(req, fiber.TestConfig{Timeout: 5 * time.Second})
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

func TestNewHelloHandler_RequiresCache(t *testing.T) {
	if _, err := NewHelloHandler(HelloHandlerOpts{}); err == nil {
		t.Fatal("expected cache is required error")
	}
}

func TestNewHelloHandler_DefaultsFromEnv(t *testing.T) {
	original := os.Getenv("APP_HANDLER_SPANS_ENABLED")
	if err := os.Setenv("APP_HANDLER_SPANS_ENABLED", "true"); err != nil {
		t.Fatalf("Setenv: %v", err)
	}
	t.Cleanup(func() {
		if original == "" {
			_ = os.Unsetenv("APP_HANDLER_SPANS_ENABLED")
		} else {
			_ = os.Setenv("APP_HANDLER_SPANS_ENABLED", original)
		}
	})

	h, err := NewHelloHandler(HelloHandlerOpts{Cache: stubCache{value: "value-1", ok: true}})
	if err != nil {
		t.Fatalf("NewHelloHandler: %v", err)
	}
	if h.logger == nil || h.tracer == nil || h.spansEnabled == nil || !*h.spansEnabled {
		t.Fatalf("expected defaults to be populated, got %#v", h)
	}
	if h.reqCountReg == nil {
		t.Fatal("expected observable counter registration to be created")
	}
}

func TestVirtual_NotFound(t *testing.T) {
	app := fiber.New()
	h, err := NewHelloHandler(HelloHandlerOpts{
		Cache:        stubCache{},
		Logger:       newTestLogger(io.Discard),
		Meter:        metricnoop.NewMeterProvider().Meter("test"),
		Tracer:       tracenoop.NewTracerProvider().Tracer("test"),
		SpansEnabled: boolPtr(false),
	})
	if err != nil {
		t.Fatalf("NewHelloHandler: %v", err)
	}
	app.Get("/hello/virtual", h.Virtual)

	resp, err := app.Test(httptest.NewRequest("GET", "/hello/virtual", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != fiber.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestVirtual_SpansEnabled(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	app := fiber.New()
	h, err := NewHelloHandler(HelloHandlerOpts{
		Cache:        stubCache{value: "value-1", ok: true},
		Logger:       newTestLogger(io.Discard),
		Meter:        metricnoop.NewMeterProvider().Meter("test"),
		Tracer:       tp.Tracer("test"),
		SpansEnabled: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("NewHelloHandler: %v", err)
	}
	app.Get("/hello/virtual", h.Virtual)

	resp, err := app.Test(httptest.NewRequest("GET", "/hello/virtual", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	spans := recorder.Ended()
	if len(spans) != 1 || spans[0].Name() != "hello.virtual" {
		t.Fatalf("unexpected recorded spans: %#v", spans)
	}
}

func TestParseHelloParams(t *testing.T) {
	cases := []struct {
		name       string
		query      string
		wantLog    bool
		wantSleep  int
		wantErrMsg string
	}{
		{name: "empty", query: "", wantLog: false, wantSleep: 0},
		{name: "truthy numeric", query: "log=1&sleep=2", wantLog: true, wantSleep: 2},
		{name: "false zero", query: "log=0&sleep=0", wantLog: false, wantSleep: 0},
		{name: "empty log value", query: "log=&sleep=3", wantLog: false, wantSleep: 3},
		{name: "missing equals ignored", query: "orphan&sleep=4", wantLog: false, wantSleep: 4},
		{name: "invalid log", query: "log=maybe", wantErrMsg: "invalid log value"},
		{name: "invalid sleep", query: "sleep=nope", wantErrMsg: "invalid sleep value"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			logEnabled, sleep, err := parseHelloParams([]byte(tc.query))
			if tc.wantErrMsg != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErrMsg) {
					t.Fatalf("expected error containing %q, got %v", tc.wantErrMsg, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseHelloParams(%q): %v", tc.query, err)
			}
			if logEnabled != tc.wantLog || sleep != tc.wantSleep {
				t.Fatalf("parseHelloParams(%q) = (%v, %d), want (%v, %d)", tc.query, logEnabled, sleep, tc.wantLog, tc.wantSleep)
			}
		})
	}
}

func TestBytesEqualStringAndIndexByte(t *testing.T) {
	if !bytesEqualString([]byte("hello"), "hello") {
		t.Fatal("expected bytesEqualString match")
	}
	if bytesEqualString([]byte("hello"), "world") {
		t.Fatal("did not expect bytesEqualString mismatch to match")
	}
	if got := indexByte([]byte("a=b"), '='); got != 1 {
		t.Fatalf("expected '=' at index 1, got %d", got)
	}
	if got := indexByte([]byte("abc"), '='); got != -1 {
		t.Fatalf("expected missing byte index -1, got %d", got)
	}
}

func TestParseNonNegInt_InvalidInputs(t *testing.T) {
	for _, input := range [][]byte{nil, []byte(""), []byte("-1"), []byte("abc")} {
		if _, ok := parseNonNegInt(input); ok {
			t.Fatalf("expected parse failure for %q", string(input))
		}
	}
	if n, ok := parseNonNegInt([]byte("123")); !ok || n != 123 {
		t.Fatalf("expected successful parse, got n=%d ok=%v", n, ok)
	}
}

func boolPtr(v bool) *bool { return &v }

func TestParseNonNegInt_OverflowRejected(t *testing.T) {
	// A value larger than MaxInt should be rejected (previous implementation could wrap silently).
	// Note: this is not MaxInt+1; it appends an extra digit, guaranteeing the value exceeds MaxInt.
	overMax := []byte(strconv.Itoa(math.MaxInt) + "1")
	if _, ok := parseNonNegInt(overMax); ok {
		t.Fatalf("expected overflow to be rejected for value > MaxInt")
	}
}
