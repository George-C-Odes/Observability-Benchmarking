// Package logging provides structured slog handlers with trace-context injection
// and multi-handler fan-out support.
package logging

import (
	"context"
	"errors"
	"log/slog"
	"os"

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

// NewMultiHandler creates a MultiHandler that fans out to the given handlers.
func NewMultiHandler(handlers ...slog.Handler) *MultiHandler {
	return &MultiHandler{handlers: handlers}
}

// Enabled reports whether any of the underlying handlers is enabled for the given level.
func (m *MultiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

// Handle forwards the record to each enabled handler, joining any errors.
func (m *MultiHandler) Handle(ctx context.Context, r slog.Record) error {
	var errs []error
	for _, h := range m.handlers {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r); err != nil {
				errs = append(errs, err)
			}
		}
	}
	return errors.Join(errs...)
}

// WithAttrs returns a new MultiHandler whose underlying handlers all include the given attrs.
func (m *MultiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := make([]slog.Handler, 0, len(m.handlers))
	for _, h := range m.handlers {
		next = append(next, h.WithAttrs(attrs))
	}
	return &MultiHandler{handlers: next}
}

// WithGroup returns a new MultiHandler whose underlying handlers all use the given group name.
func (m *MultiHandler) WithGroup(name string) slog.Handler {
	next := make([]slog.Handler, 0, len(m.handlers))
	for _, h := range m.handlers {
		next = append(next, h.WithGroup(name))
	}
	return &MultiHandler{handlers: next}
}

// TraceContextHandler enriches log records with trace_id and span_id when available.
// This is useful when logs are scraped from stdout (e.g., by Grafana Alloy) and you
// want correlation without requiring OTLP logs.
type TraceContextHandler struct {
	inner slog.Handler
}

// NewTraceContextHandler wraps inner with trace-context attribute injection.
func NewTraceContextHandler(inner slog.Handler) *TraceContextHandler {
	return &TraceContextHandler{inner: inner}
}

// Enabled delegates to the inner handler.
func (h *TraceContextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

// Handle injects trace_id and span_id attributes when a valid span is present, then delegates.
func (h *TraceContextHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(
			slog.String("trace_id", sc.TraceID().String()),
			slog.String("span_id", sc.SpanID().String()),
		)
	}
	return h.inner.Handle(ctx, r)
}

// WithAttrs returns a new TraceContextHandler wrapping the inner handler with the given attrs.
func (h *TraceContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &TraceContextHandler{inner: h.inner.WithAttrs(attrs)}
}

// WithGroup returns a new TraceContextHandler wrapping the inner handler with the given group name.
func (h *TraceContextHandler) WithGroup(name string) slog.Handler {
	return &TraceContextHandler{inner: h.inner.WithGroup(name)}
}
