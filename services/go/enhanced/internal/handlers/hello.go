package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"hello/internal/cache"
)

// HelloHandler serves the /hello/* endpoints.
type HelloHandler struct {
	cache        cache.Cache
	logger       *slog.Logger
	tracer       trace.Tracer
	spansEnabled bool

	// Fast, per-process request count. Exported as an ObservableCounter (no per-request OTEL calls).
	reqCount      atomic.Uint64
	reqCountAttrs attribute.Set
	reqCountReg   metric.Registration
}

// HelloHandlerOpts allows overriding dependencies (useful for tests).
type HelloHandlerOpts struct {
	Cache  cache.Cache
	Logger *slog.Logger
	Tracer trace.Tracer
	Meter  metric.Meter

	// SpansEnabled controls the optional nested spans created inside handlers.
	// If nil, defaults to false (rely on framework instrumentation only).
	SpansEnabled *bool
}

func NewHelloHandler(opts HelloHandlerOpts) (*HelloHandler, error) {
	if opts.Cache == nil {
		return nil, errors.New("cache is required")
	}
	if opts.Logger == nil {
		opts.Logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	}
	if opts.Tracer == nil {
		opts.Tracer = otel.Tracer("hello/internal/handlers")
	}
	if opts.Meter == nil {
		opts.Meter = otel.Meter("hello/internal/handlers")
	}

	spansEnabled := false
	if opts.SpansEnabled != nil {
		spansEnabled = *opts.SpansEnabled
	} else if v, ok := os.LookupEnv("APP_HANDLER_SPANS_ENABLED"); ok {
		// Allow pure env-based enable/disable without wiring config through.
		spansEnabled = parseBoolLoose(v, false)
	}

	h := &HelloHandler{
		cache:         opts.Cache,
		logger:        opts.Logger,
		tracer:        opts.Tracer,
		spansEnabled:  spansEnabled,
		reqCountAttrs: attribute.NewSet(attribute.String("endpoint", "/hello/virtual")),
	}

	// Export hello.request.count efficiently:
	// - increment an atomic per request
	// - observe the cumulative value on each export cycle
	reqObs, err := opts.Meter.Int64ObservableCounter(
		"hello.request.count",
		metric.WithDescription("Total number of /hello/virtual requests handled by this process"),
	)
	if err == nil {
		reg, err := opts.Meter.RegisterCallback(func(_ context.Context, o metric.Observer) error {
			o.ObserveInt64(reqObs, int64(h.reqCount.Load()), metric.WithAttributeSet(h.reqCountAttrs))
			return nil
		}, reqObs)
		if err == nil {
			h.reqCountReg = reg
		}
	} else {
		// If metrics are not configured, keep the handler working.
		opts.Logger.Debug("failed to create hello.request.count observable counter", slog.Any("err", err))
	}

	return h, nil
}

// Virtual handles: GET /hello/virtual?log=true&sleep=1
// - log (default false): prints minimal goroutine/thread-ish info
// - sleep (default 0): sleeps N seconds before continuing
func (h *HelloHandler) Virtual(c *fiber.Ctx) error {
	h.reqCount.Add(1)

	ctx := c.UserContext()
	var span trace.Span
	if h.spansEnabled {
		ctx, span = h.tracer.Start(ctx, "hello.virtual")
		defer span.End()
	}

	logEnabled, sleepSeconds, err := parseHelloParams(c.Context().URI().QueryString())
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	if logEnabled {
		// Go doesn't expose a stable "goroutine id" or OS thread id in the standard library.
		// For benchmarking, keep this extremely cheap.
		h.logger.InfoContext(ctx, "goroutine thread :",
			slog.Int("goroutines", runtime.NumGoroutine()),
			slog.Int("pid", os.Getpid()),
		)
	}

	if sleepSeconds > 0 {
		time.Sleep(time.Duration(sleepSeconds) * time.Second)
	}

	value, ok := h.cache.Get("1")
	if !ok {
		return fiber.NewError(fiber.StatusNotFound, "value not found")
	}

	return c.SendString(fmt.Sprintf("Hello from GO REST %v", value))
}

func parseHelloParams(rawQuery []byte) (logEnabled bool, sleepSeconds int, err error) {
	if len(rawQuery) == 0 {
		return false, 0, nil
	}
	q, err := url.ParseQuery(string(rawQuery))
	if err != nil {
		return false, 0, fmt.Errorf("invalid query: %w", err)
	}

	// log=true|false (default false)
	if v := strings.TrimSpace(q.Get("log")); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return false, 0, fmt.Errorf("invalid log=%q (expected true/false)", v)
		}
		logEnabled = b
	}

	// sleep=<seconds> (default 0)
	if v := strings.TrimSpace(q.Get("sleep")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return logEnabled, 0, fmt.Errorf("invalid sleep=%q (expected non-negative integer seconds)", v)
		}
		sleepSeconds = n
	}

	return logEnabled, sleepSeconds, nil
}

func parseBoolLoose(v string, def bool) bool {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}
