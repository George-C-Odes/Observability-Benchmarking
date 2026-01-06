package logging

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"strconv"
	"strings"

	"go.opentelemetry.io/otel/trace"
)

// NewJSONLogger creates a JSON logger writing to stdout, with a handler that
// injects trace_id/span_id into every record when a span is present in ctx.
func NewJSONLogger(level slog.Level) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     level,
		AddSource: false,
	})
	return slog.New(NewTraceContextHandler(h))
}

// MultiHandler fans out to multiple slog handlers.
type MultiHandler struct {
	handlers []slog.Handler
}

func NewMultiHandler(handlers ...slog.Handler) *MultiHandler {
	return &MultiHandler{handlers: handlers}
}

func (m *MultiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *MultiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.handlers {
		if h.Enabled(ctx, r.Level) {
			_ = h.Handle(ctx, r)
		}
	}
	return nil
}

func (m *MultiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, 0, len(m.handlers))
	for _, h := range m.handlers {
		next = append(next, h.WithAttrs(attrs))
	}
	return &MultiHandler{handlers: next}
}

func (m *MultiHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, 0, len(m.handlers))
	for _, h := range m.handlers {
		next = append(next, h.WithGroup(name))
	}
	return &MultiHandler{handlers: next}
}

// TraceContextHandler enriches log records with trace_id and span_id when available.
// This is useful when logs are scraped from stdout (e.g. by Grafana Alloy) and you
// want correlation without requiring OTLP logs.
type TraceContextHandler struct {
	inner slog.Handler
}

func NewTraceContextHandler(inner slog.Handler) *TraceContextHandler {
	return &TraceContextHandler{inner: inner}
}

func (h *TraceContextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *TraceContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}
	return h.inner.Handle(ctx, r)
}

func (h *TraceContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &TraceContextHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *TraceContextHandler) WithGroup(name string) slog.Handler {
	return &TraceContextHandler{inner: h.inner.WithGroup(name)}
}

// GoroutineID returns the current goroutine id.
//
// Note: Go does not expose goroutine IDs as a public API. This helper parses
// runtime.Stack output and is intended for debugging/demo purposes only.
func GoroutineID() int64 {
	var buf [64]byte
	n := runtime.Stack(buf[:], false)
	// First line: "goroutine 123 [running]:"
	line := strings.TrimSpace(string(buf[:n]))
	if !strings.HasPrefix(line, "goroutine ") {
		return -1
	}
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return -1
	}
	id, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return -1
	}
	return id
}
