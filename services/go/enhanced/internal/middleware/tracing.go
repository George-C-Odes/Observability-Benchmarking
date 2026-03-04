package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// MinimalHTTPTracingMiddleware returns a lightweight Fiber handler that creates
// a single server span per request using the provided tracer. Paths in
// ignorePaths are skipped entirely (no span created).
//
// Compared to otelfiber this avoids attribute-heavy spans and per-request
// allocations while keeping distributed-trace propagation intact.
func MinimalHTTPTracingMiddleware(
	tracer trace.Tracer,
	spanNameFn func(fiber.Ctx) string,
	propagators propagation.TextMapPropagator,
	ignorePaths []string,
) fiber.Handler {
	// Pre-normalise ignored paths once so we never TrimSpace per request.
	trimmed := normalisePaths(ignorePaths)

	return func(c fiber.Ctx) error {
		if isIgnoredPath(c.Path(), trimmed) {
			return c.Next()
		}

		ctx := c.Context()

		// Avoid allocating a full map of request headers. TraceContext needs only these.
		// If propagation is "disabled", the propagators passed in is effectively no-op.
		ctx = propagators.Extract(ctx, fiberTraceContextCarrier{c: c})

		ctx, span := tracer.Start(ctx, spanNameFn(c), trace.WithSpanKind(trace.SpanKindServer))
		c.SetContext(ctx)

		err := c.Next()

		// Minimal error/status handling (keep overhead low).
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, "handler error")
		} else if c.Response().StatusCode() >= 500 {
			span.SetStatus(codes.Error, "server error")
		}

		span.End()
		return err
	}
}

// fiberTraceContextCarrier is a small carrier optimised for TraceContext extraction.
type fiberTraceContextCarrier struct {
	c fiber.Ctx
}

func (h fiberTraceContextCarrier) Get(key string) string {
	// Fiber header lookup is case-insensitive.
	return h.c.Get(key)
}

func (h fiberTraceContextCarrier) Set(string, string) {
	// Not needed for extraction in a server middleware.
}

func (h fiberTraceContextCarrier) Keys() []string {
	// Only the keys TraceContext uses; keeps it fast.
	return []string{"traceparent", "tracestate"}
}

// MakeSpanNameFormatter returns a function that derives the OTel span name
// from a Fiber request context according to the given mode.
func MakeSpanNameFormatter(mode string) func(c fiber.Ctx) string {
	mode = strings.ToLower(strings.TrimSpace(mode))
	switch mode {
	case "method":
		return func(c fiber.Ctx) string {
			return c.Method()
		}
	case "route":
		return func(c fiber.Ctx) string {
			return routeTemplate(c)
		}
	case "path":
		return func(c fiber.Ctx) string {
			return c.Path()
		}
	case "method_route":
		return func(c fiber.Ctx) string {
			return c.Method() + " " + routeTemplate(c)
		}
	case "method_path":
		return func(c fiber.Ctx) string {
			return c.Method() + " " + c.Path()
		}
	case "constant":
		fallthrough
	default:
		return func(fiber.Ctx) string {
			return "http.request"
		}
	}
}

func routeTemplate(c fiber.Ctx) string {
	if r := c.Route(); r != nil && strings.TrimSpace(r.Path) != "" {
		return r.Path
	}
	return c.Path()
}

// IsIgnoredPath reports whether path matches any entry in the (pre-normalised)
// ignore list. It supports exact matches and simple prefix globs ending in "*".
func IsIgnoredPath(path string, ignore []string) bool {
	return isIgnoredPath(path, ignore)
}

// NormalisePaths trims whitespace from each path once. Use the result
// with IsIgnoredPath to avoid per-request allocations.
func NormalisePaths(paths []string) []string {
	return normalisePaths(paths)
}

func normalisePaths(paths []string) []string {
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func isIgnoredPath(path string, ignore []string) bool {
	if path == "" || len(ignore) == 0 {
		return false
	}
	for _, p := range ignore {
		// Support exact matches and simple prefix globs like "/health*".
		if strings.HasSuffix(p, "*") {
			if strings.HasPrefix(path, strings.TrimSuffix(p, "*")) {
				return true
			}
			continue
		}
		if path == p {
			return true
		}
	}
	return false
}
