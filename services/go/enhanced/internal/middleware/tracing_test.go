package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	oteltrace "go.opentelemetry.io/otel/trace"
)

func TestNormalizePathsAndIgnoredPath(t *testing.T) {
	paths := NormalizePaths([]string{" /healthz ", "", "/ready*", "   "})
	if len(paths) != 2 || paths[0] != "/healthz" || paths[1] != "/ready*" {
		t.Fatalf("unexpected normalized paths: %#v", paths)
	}

	if !IsIgnoredPath("/healthz", paths) {
		t.Fatal("expected exact path to be ignored")
	}
	if !IsIgnoredPath("/readyz", paths) {
		t.Fatal("expected globbed path to be ignored")
	}
	if IsIgnoredPath("/hello", paths) {
		t.Fatal("did not expect /hello to be ignored")
	}
	if IsIgnoredPath("", paths) {
		t.Fatal("empty path should not be ignored")
	}
}

func TestMakeSpanNameFormatter(t *testing.T) {
	modes := map[string]string{
		"method":       http.MethodGet,
		"route":        "/users/:id",
		"path":         "/users/123",
		"method_route": "GET /users/:id",
		"method_path":  "GET /users/123",
		"constant":     "http.request",
		"unknown":      "http.request",
	}

	for mode, want := range modes {
		t.Run(mode, func(t *testing.T) {
			formatter := MakeSpanNameFormatter(mode)
			app := fiber.New()
			var got string
			app.Get("/users/:id", func(c fiber.Ctx) error {
				got = formatter(c)
				return c.SendStatus(fiber.StatusOK)
			})

			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/users/123", nil))
			if err != nil {
				t.Fatalf("app.Test: %v", err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("expected 200, got %d", resp.StatusCode)
			}
			if got != want {
				t.Fatalf("mode %q: got %q, want %q", mode, got, want)
			}
		})
	}
}

func TestFiberTraceContextCarrier(t *testing.T) {
	carrier := fiberTraceContextCarrier{}
	carrier.Set("traceparent", "value")
	carrier.Set("tracestate", "other")
	keys := carrier.Keys()
	if len(keys) != 2 || keys[0] != "traceparent" || keys[1] != "tracestate" {
		t.Fatalf("unexpected keys: %#v", keys)
	}
}

func TestRouteTemplateFallback(t *testing.T) {
	app := fiber.New()
	var got string
	app.Use(func(c fiber.Ctx) error {
		got = routeTemplate(c)
		return c.SendStatus(fiber.StatusAccepted)
	})

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/fallback", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", resp.StatusCode)
	}
	if got == "" {
		t.Fatal("expected non-empty routeTemplate fallback")
	}
}

func TestMinimalHTTPTracingMiddleware(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	tracer := tp.Tracer("test")

	app := fiber.New()
	app.Use(MinimalHTTPTracingMiddleware(
		tracer,
		MakeSpanNameFormatter("method_route"),
		propagation.TraceContext{},
		NormalizePaths([]string{"/ignore*"}),
	))
	app.Get("/users/:id", func(c fiber.Ctx) error {
		if !oteltrace.SpanFromContext(c.Context()).SpanContext().IsValid() {
			return errors.New("missing span context")
		}
		return c.SendStatus(fiber.StatusCreated)
	})
	app.Get("/error", func(_ fiber.Ctx) error {
		return errors.New("boom")
	})
	app.Get("/server-error", func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusInternalServerError)
	})
	app.Get("/ignore/me", func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/users/123", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test success route: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}

	resp, err = app.Test(httptest.NewRequest(http.MethodGet, "/error", nil))
	if err != nil {
		t.Fatalf("app.Test error route: %v", err)
	}
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500 for handler error route, got %d", resp.StatusCode)
	}

	resp, err = app.Test(httptest.NewRequest(http.MethodGet, "/server-error", nil))
	if err != nil {
		t.Fatalf("app.Test server-error route: %v", err)
	}
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", resp.StatusCode)
	}

	resp, err = app.Test(httptest.NewRequest(http.MethodGet, "/ignore/me", nil))
	if err != nil {
		t.Fatalf("app.Test ignored route: %v", err)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	spans := recorder.Ended()
	if len(spans) != 3 {
		t.Fatalf("expected 3 recorded spans, got %d", len(spans))
	}
	if spans[0].Name() == "" || spans[1].Name() == "" || spans[2].Name() == "" {
		t.Fatalf("expected non-empty span names, got %q / %q / %q", spans[0].Name(), spans[1].Name(), spans[2].Name())
	}
	if spans[1].Status().Code != codes.Error {
		t.Fatalf("expected error status for handler error span, got %#v", spans[1].Status())
	}
	if spans[2].Status().Code != codes.Error {
		t.Fatalf("expected error status for 500 span, got %#v", spans[2].Status())
	}
}
