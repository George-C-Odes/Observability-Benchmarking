package handlers

import (
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"go.opentelemetry.io/otel/metric"
	metricnoop "go.opentelemetry.io/otel/metric/noop"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	tracenoop "go.opentelemetry.io/otel/trace/noop"
)

func TestHelloRequestCounter(t *testing.T) {
	for _, tc := range []struct {
		name   string
		cache  stubCache
		status int
	}{
		{name: "cache hit", cache: stubCache{value: "value-1", ok: true}, status: http.StatusOK},
		{name: "cache miss", cache: stubCache{}, status: http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			testHelloRequestCounter(t, tc.cache, tc.status)
		})
	}
}

func testHelloRequestCounter(t *testing.T, c stubCache, status int) {
	t.Helper()
	reader := sdkmetric.NewManualReader()
	provider := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))
	t.Cleanup(func() {
		if err := provider.Shutdown(context.Background()); err != nil {
			t.Errorf("meter shutdown: %v", err)
		}
	})
	h, err := NewHelloHandler(HelloHandlerOpts{
		Cache:        c,
		Logger:       newTestLogger(io.Discard),
		Meter:        provider.Meter("test"),
		Tracer:       tracenoop.NewTracerProvider().Tracer("test"),
		SpansEnabled: new(false),
	})
	if err != nil {
		t.Fatalf("NewHelloHandler: %v", err)
	}
	if h.reqCountReg == nil {
		t.Fatal("expected a registered metric callback")
	}
	app := fiber.New()
	app.Get("/hello/virtual", h.Virtual)

	assertHelloRequestCount(t, reader, 0)
	for i, request := range []struct {
		path   string
		status int
	}{
		{path: "/hello/virtual", status: status},
		{path: "/hello/virtual?log=invalid", status: http.StatusBadRequest},
		{path: "/hello/virtual?sleep=-1", status: http.StatusBadRequest},
	} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, request.path, nil))
		if err != nil {
			t.Fatalf("app.Test: %v", err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != request.status {
			t.Fatalf("%s: status = %d, want %d", request.path, resp.StatusCode, request.status)
		}
		assertHelloRequestCount(t, reader, int64(i+1))
	}
	// Collection must not reset the cumulative request count.
	assertHelloRequestCount(t, reader, 3)
	for _, count := range []uint64{math.MaxInt64, uint64(math.MaxInt64) + 1, math.MaxUint64} {
		h.reqCount.Store(count)
		assertHelloRequestCount(t, reader, math.MaxInt64)
	}
}

func assertHelloRequestCount(t *testing.T, reader *sdkmetric.ManualReader, want int64) {
	t.Helper()
	var collected metricdata.ResourceMetrics
	if err := reader.Collect(context.Background(), &collected); err != nil {
		t.Fatalf("collect metrics: %v", err)
	}
	for _, scope := range collected.ScopeMetrics {
		for _, m := range scope.Metrics {
			if m.Name != "hello.request.count" {
				continue
			}
			assertHelloCounterData(t, m.Data, want)
			return
		}
	}
	t.Fatal("hello.request.count was not collected")
}

func assertHelloCounterData(t *testing.T, data metricdata.Aggregation, want int64) {
	t.Helper()
	sum, ok := data.(metricdata.Sum[int64])
	if !ok || !sum.IsMonotonic || sum.Temporality != metricdata.CumulativeTemporality || len(sum.DataPoints) != 1 {
		t.Fatalf("unexpected counter data: %#v", data)
	}
	point := sum.DataPoints[0]
	if point.Value != want {
		t.Errorf("request count = %d, want %d", point.Value, want)
	}
	endpoint, ok := point.Attributes.Value("endpoint")
	if !ok || endpoint.AsString() != "/hello/virtual" || point.Attributes.Len() != 1 {
		t.Errorf("unexpected metric attributes: %v", point.Attributes)
	}
}

// Embed the no-op meter to implement the rest of the OTel interface without
// mocking unrelated instruments.
type failingMeter struct {
	metric.Meter
	failCounter bool
	err         error
}

func (m failingMeter) Int64ObservableCounter(name string, opts ...metric.Int64ObservableCounterOption) (metric.Int64ObservableCounter, error) {
	if m.failCounter {
		return nil, m.err
	}
	return m.Meter.Int64ObservableCounter(name, opts...)
}

func (m failingMeter) RegisterCallback(metric.Callback, ...metric.Observable) (metric.Registration, error) {
	return nil, m.err
}

func TestHelloHandlerMetricFailuresAreNonFatal(t *testing.T) {
	for _, failCounter := range []bool{true, false} {
		name := "callback registration"
		if failCounter {
			name = "counter creation"
		}
		t.Run(name, func(t *testing.T) {
			testHelloHandlerMetricFailure(t, failCounter)
		})
	}
}

func testHelloHandlerMetricFailure(t *testing.T, failCounter bool) {
	t.Helper()
	h, err := NewHelloHandler(HelloHandlerOpts{
		Cache:  stubCache{value: "value-1", ok: true},
		Logger: newTestLogger(io.Discard),
		Meter: failingMeter{
			Meter:       metricnoop.NewMeterProvider().Meter("test"),
			failCounter: failCounter,
			err:         errors.New("metric setup failed"),
		},
		Tracer:       tracenoop.NewTracerProvider().Tracer("test"),
		SpansEnabled: new(false),
	})
	if err != nil {
		t.Fatalf("metric failure should not prevent handler creation: %v", err)
	}
	if h.reqCountReg != nil {
		t.Fatal("failed metric initialization should not retain a registration")
	}
	app := fiber.New()
	app.Get("/hello/virtual", h.Virtual)
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/hello/virtual", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if resp.StatusCode != http.StatusOK || string(body) != `"Hello from GO REST value-1"` || h.reqCount.Load() != 1 {
		t.Fatalf("metric failure changed endpoint behavior: status=%d body=%q count=%d", resp.StatusCode, body, h.reqCount.Load())
	}
}
