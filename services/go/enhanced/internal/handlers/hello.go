// Package handlers implement the HTTP request handlers for the service.
package handlers

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"os"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"hello/internal/cache"
	"hello/internal/config"
)

// HelloHandler serves the /hello/* endpoints.
type HelloHandler struct {
	cache        cache.Cache
	logger       *slog.Logger
	tracer       trace.Tracer
	spansEnabled *bool

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

// NewHelloHandler creates a new HelloHandler with the given options, registering
// an observable counter for request metrics.
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

	if opts.SpansEnabled == nil {
		enabled := false
		if v, ok := os.LookupEnv("APP_HANDLER_SPANS_ENABLED"); ok {
			enabled = config.ParseBoolLoose(v, false)
		}
		opts.SpansEnabled = &enabled
	}

	h := &HelloHandler{
		cache:         opts.Cache,
		logger:        opts.Logger,
		tracer:        opts.Tracer,
		spansEnabled:  opts.SpansEnabled,
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
			count := h.reqCount.Load()
			if count > math.MaxInt64 {
				count = math.MaxInt64
			}
			o.ObserveInt64(reqObs, int64(count), metric.WithAttributeSet(h.reqCountAttrs)) //nolint:gosec // capped above
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
func (h *HelloHandler) Virtual(c fiber.Ctx) error {
	h.reqCount.Add(1)

	ctx := c.Context()
	var span trace.Span
	if *h.spansEnabled {
		ctx, span = h.tracer.Start(ctx, "hello.virtual")
		defer span.End()
	}

	logEnabled, sleepSeconds, err := parseHelloParams(c.RequestCtx().URI().QueryString())
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	if logEnabled {
		h.logger.InfoContext(ctx, "goroutine thread :",
			slog.Int("goroutines", runtime.NumGoroutine()),
			slog.Int("pid", os.Getpid()),
		)
	}

	if sleepSeconds > 0 {
		time.Sleep(time.Duration(sleepSeconds) * time.Second)
	}

	// Keep cache lookup on the hot path to preserve the intended benchmark workload.
	value, ok := h.cache.Get("1")
	if !ok {
		return fiber.NewError(fiber.StatusNotFound, "value not found")
	}

	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	return c.SendString(`"Hello from GO REST ` + value + `"`)
}

// parseHelloParams does zero-allocation query string parsing for the two
// known parameters ("log" and "sleep"). It avoids url.ParseQuery entirely.
func parseHelloParams(rawQuery []byte) (logEnabled bool, sleepSeconds int, err error) {
	if len(rawQuery) == 0 {
		return false, 0, nil
	}

	// Walk ampersand-separated pairs.
	for len(rawQuery) > 0 {
		var pair []byte
		if idx := indexByte(rawQuery, '&'); idx >= 0 {
			pair = rawQuery[:idx]
			rawQuery = rawQuery[idx+1:]
		} else {
			pair = rawQuery
			rawQuery = nil
		}

		eqIdx := indexByte(pair, '=')
		if eqIdx < 0 {
			continue
		}
		key := pair[:eqIdx]
		val := pair[eqIdx+1:]

		if bytesEqualString(key, "log") {
			switch {
			case bytesEqualString(val, "true") || bytesEqualString(val, "1"):
				logEnabled = true
			case bytesEqualString(val, "false") || bytesEqualString(val, "0") || len(val) == 0:
				logEnabled = false
			default:
				return false, 0, fiber.NewError(fiber.StatusBadRequest, "invalid log value (expected true/false)")
			}
		} else if bytesEqualString(key, "sleep") {
			n, ok := parseNonNegInt(val)
			if !ok {
				return false, 0, fiber.NewError(fiber.StatusBadRequest, "invalid sleep value (expected non-negative integer seconds)")
			}
			sleepSeconds = n
		}
	}
	return logEnabled, sleepSeconds, nil
}

func indexByte(b []byte, c byte) int {
	for i, v := range b {
		if v == c {
			return i
		}
	}
	return -1
}

func bytesEqualString(b []byte, s string) bool {
	if len(b) != len(s) {
		return false
	}
	for i := range b {
		if b[i] != s[i] {
			return false
		}
	}
	return true
}

// parseNonNegInt parses a non-negative integer from a byte slice without allocating.
func parseNonNegInt(b []byte) (int, bool) {
	if len(b) == 0 {
		return 0, false
	}
	// Mirror internal/cache.parsePositiveIntFast overflow behavior.
	const maxSafe = (math.MaxInt - 9) / 10

	n := 0
	for _, ch := range b {
		if ch < '0' || ch > '9' {
			return 0, false
		}
		if n > maxSafe {
			return 0, false // overflow
		}
		n = n*10 + int(ch-'0')
	}
	return n, true
}
