package logging

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

type testHandler struct {
	enabled bool
	err     error
	records []slog.Record
	attrs   []slog.Attr
	groups  []string
}

func (h *testHandler) Enabled(context.Context, slog.Level) bool { return h.enabled }

func (h *testHandler) Handle(_ context.Context, r slog.Record) error {
	clone := slog.NewRecord(r.Time, r.Level, r.Message, r.PC)
	r.Attrs(func(a slog.Attr) bool {
		clone.AddAttrs(a)
		return true
	})
	h.records = append(h.records, clone)
	return h.err
}

func (h *testHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := *h
	next.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	next.records = nil
	return &next
}

func (h *testHandler) WithGroup(name string) slog.Handler {
	next := *h
	next.groups = append(append([]string{}, h.groups...), name)
	next.records = nil
	return &next
}

func recordAttrs(r slog.Record) map[string]string {
	out := map[string]string{}
	r.Attrs(func(a slog.Attr) bool {
		out[a.Key] = a.Value.String()
		return true
	})
	return out
}

func TestNewMultiHandler(t *testing.T) {
	h1 := &testHandler{enabled: true}
	h2 := &testHandler{enabled: false}
	mh := NewMultiHandler(h1, h2)

	if !mh.Enabled(context.Background(), slog.LevelInfo) {
		t.Fatal("expected MultiHandler to be enabled when any child is enabled")
	}

	rec := slog.NewRecord(time.Now(), slog.LevelInfo, "hello", 0)
	rec.AddAttrs(slog.String("key", "value"))
	if err := mh.Handle(context.Background(), rec); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(h1.records) != 1 {
		t.Fatalf("expected handler 1 to receive a record, got %d", len(h1.records))
	}
	if len(h2.records) != 0 {
		t.Fatalf("expected disabled handler to receive no records, got %d", len(h2.records))
	}

	attrsHandler, ok := mh.WithAttrs([]slog.Attr{slog.String("scope", "test")}).(*MultiHandler)
	if !ok {
		t.Fatal("expected WithAttrs to return *MultiHandler")
	}
	if len(attrsHandler.handlers) != 2 {
		t.Fatalf("unexpected WithAttrs handler count: %d", len(attrsHandler.handlers))
	}
	childWithAttrs, ok := attrsHandler.handlers[0].(*testHandler)
	if !ok || len(childWithAttrs.attrs) != 1 || childWithAttrs.attrs[0].Key != "scope" {
		t.Fatalf("unexpected child attrs: %#v", childWithAttrs)
	}

	groupHandler, ok := mh.WithGroup("api").(*MultiHandler)
	if !ok {
		t.Fatal("expected WithGroup to return *MultiHandler")
	}
	childWithGroup, ok := groupHandler.handlers[0].(*testHandler)
	if !ok || len(childWithGroup.groups) != 1 || childWithGroup.groups[0] != "api" {
		t.Fatalf("unexpected child groups: %#v", childWithGroup)
	}
}

func TestMultiHandlerDisabledWhenNoChildrenEnabled(t *testing.T) {
	mh := NewMultiHandler(&testHandler{enabled: false}, &testHandler{enabled: false})
	if mh.Enabled(context.Background(), slog.LevelInfo) {
		t.Fatal("expected MultiHandler to be disabled when all children are disabled")
	}
}

func TestMultiHandlerHandleJoinsErrors(t *testing.T) {
	err1 := errors.New("first")
	err2 := errors.New("second")
	mh := NewMultiHandler(
		&testHandler{enabled: true, err: err1},
		&testHandler{enabled: true, err: err2},
	)

	err := mh.Handle(context.Background(), slog.NewRecord(time.Now(), slog.LevelWarn, "boom", 0))
	if !errors.Is(err, err1) || !errors.Is(err, err2) {
		t.Fatalf("expected joined error, got %v", err)
	}
}

func TestTraceContextHandler(t *testing.T) {
	inner := &testHandler{enabled: true}
	h := NewTraceContextHandler(inner)

	if !h.Enabled(context.Background(), slog.LevelInfo) {
		t.Fatal("expected handler to delegate Enabled to inner handler")
	}

	tp := sdktrace.NewTracerProvider()
	ctx, span := tp.Tracer("test").Start(context.Background(), "span")
	defer span.End()

	rec := slog.NewRecord(time.Now(), slog.LevelInfo, "with-trace", 0)
	if err := h.Handle(ctx, rec); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	attrs := recordAttrs(inner.records[0])
	if attrs["trace_id"] == "" || attrs["span_id"] == "" {
		t.Fatalf("expected trace attrs, got %#v", attrs)
	}

	inner.records = nil
	if err := h.Handle(context.Background(), slog.NewRecord(time.Now(), slog.LevelInfo, "without-trace", 0)); err != nil {
		t.Fatalf("Handle without trace: %v", err)
	}
	attrs = recordAttrs(inner.records[0])
	if _, ok := attrs["trace_id"]; ok {
		t.Fatalf("did not expect trace attrs without valid span: %#v", attrs)
	}

	attrsWrapped, ok := h.WithAttrs([]slog.Attr{slog.String("a", "b")}).(*TraceContextHandler)
	if !ok {
		t.Fatal("expected WithAttrs to return *TraceContextHandler")
	}
	if _, ok := attrsWrapped.inner.(*testHandler); !ok {
		t.Fatal("expected wrapped inner handler type to be preserved")
	}

	groupWrapped, ok := h.WithGroup("group").(*TraceContextHandler)
	if !ok {
		t.Fatal("expected WithGroup to return *TraceContextHandler")
	}
	if _, ok := groupWrapped.inner.(*testHandler); !ok {
		t.Fatal("expected grouped inner handler type to be preserved")
	}
}

func TestNewJSONLogger(t *testing.T) {
	logger := NewJSONLogger(slog.LevelDebug)
	if logger == nil {
		t.Fatal("expected logger")
	}
}

func TestSlogOutputFormattingIsStableEnough(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(NewTraceContextHandler(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	ctx := trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{}))
	logger.InfoContext(ctx, "message")
	if !strings.Contains(buf.String(), "message") {
		t.Fatalf("expected message in log output, got %q", buf.String())
	}
}
