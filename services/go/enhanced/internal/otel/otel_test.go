package otel

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"hello/internal/config"
)

func TestParseEndpoint(t *testing.T) {
	if _, _, err := parseEndpoint("   "); err == nil {
		t.Fatal("expected error for empty endpoint")
	}

	isURL, endpoint, err := parseEndpoint("collector:4317")
	if err != nil || isURL || endpoint != "collector:4317" {
		t.Fatalf("unexpected host:port parse result: isURL=%v endpoint=%q err=%v", isURL, endpoint, err)
	}

	isURL, endpoint, err = parseEndpoint("https://collector.example:4317")
	if err != nil || !isURL || endpoint != "https://collector.example:4317" {
		t.Fatalf("unexpected URL parse result: isURL=%v endpoint=%q err=%v", isURL, endpoint, err)
	}

	if _, _, err = parseEndpoint("http://"); err == nil {
		t.Fatal("expected error for invalid URL endpoint")
	}
}

func TestGrpcTarget(t *testing.T) {
	if target, err := grpcTarget(false, "collector:4317"); err != nil || target != "collector:4317" {
		t.Fatalf("unexpected direct grpc target: %q err=%v", target, err)
	}

	if target, err := grpcTarget(true, "https://collector.example:4317"); err != nil || target != "collector.example:4317" {
		t.Fatalf("unexpected URL grpc target: %q err=%v", target, err)
	}

	if _, err := grpcTarget(true, "http://"); err == nil {
		t.Fatal("expected error for missing host")
	}
}

func TestNewOTLPConn(t *testing.T) {
	for _, insecure := range []bool{true, false} {
		conn, err := newOTLPConn("collector:4317", insecure)
		if err != nil {
			t.Fatalf("newOTLPConn(%v): %v", insecure, err)
		}
		if err := conn.Close(); err != nil {
			t.Fatalf("conn.Close(%v): %v", insecure, err)
		}
	}
}

func TestTraceSamplerAndClamp(t *testing.T) {
	if got := clamp01(-0.5); got != 0 {
		t.Fatalf("clamp01 negative = %v", got)
	}
	if got := clamp01(1.5); got != 1 {
		t.Fatalf("clamp01 >1 = %v", got)
	}
	if got := clamp01(0.25); got != 0.25 {
		t.Fatalf("clamp01 in range = %v", got)
	}

	cases := []struct {
		name string
		cfg  config.Config
		want string
	}{
		{name: "default", cfg: config.Config{}, want: "ParentBased{root:AlwaysOnSampler"},
		{name: "always off", cfg: config.Config{TracesSampler: "always_off"}, want: "AlwaysOffSampler"},
		{name: "ratio", cfg: config.Config{TracesSampler: "traceidratio", TracesSamplerArg: 2}, want: "TraceIDRatioBased{1}"},
		{name: "parent ratio", cfg: config.Config{TracesSampler: "parentbased_traceidratio", TracesSamplerArg: -1}, want: "ParentBased{root:TraceIDRatioBased{0}"},
		{name: "unknown fallback", cfg: config.Config{TracesSampler: "mystery"}, want: "ParentBased{root:AlwaysOnSampler"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			desc := traceSampler(tc.cfg).Description()
			if !strings.Contains(desc, tc.want) {
				t.Fatalf("traceSampler description %q does not contain %q", desc, tc.want)
			}
		})
	}
}

func TestProfileTypes(t *testing.T) {
	got := profileTypes([]string{"cpu", "alloc", "inuse", "goroutines", "mutex", "block", "unknown"})
	if len(got) != 10 {
		t.Fatalf("unexpected profileTypes length: %d", len(got))
	}
	if fallback := profileTypes([]string{"unknown"}); len(fallback) != 1 {
		t.Fatalf("expected CPU fallback, got %#v", fallback)
	}
}

func TestSlogPyroscopeLogger(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	pyLogger := &slogPyroscopeLogger{logger: logger}

	pyLogger.Infof("hello %s", "info")
	pyLogger.Debugf("hello %s", "debug")
	pyLogger.Errorf("hello %s", "error")

	output := buf.String()
	for _, snippet := range []string{"hello info", "hello debug", "hello error"} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("expected log output to contain %q, got %q", snippet, output)
		}
	}
}

func TestSetupDisabledAndInvalid(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))

	tel, err := Setup(context.Background(), config.Config{}, logger)
	if err != nil {
		t.Fatalf("Setup disabled: %v", err)
	}
	if tel.Enabled {
		t.Fatal("expected telemetry to be disabled when endpoint is empty")
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("disabled shutdown: %v", err)
	}

	_, err = Setup(context.Background(), config.Config{OtelEndpoint: "http://"}, logger)
	if err == nil {
		t.Fatal("expected invalid endpoint error")
	}
}

func TestSetupEnabledWithoutNetwork(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, &slog.HandlerOptions{Level: slog.LevelDebug}))
	cfg := config.Config{
		OtelEndpoint:            "localhost:4317",
		OtelInsecure:            true,
		MetricsEnabled:          false,
		MetricsExportInterval:   15,
		LogsEnabled:             false,
		PyroscopeEnabled:        false,
		TracesSampler:           "always_on",
		HTTPTracesMode:          "minimal",
		HTTPSpanNameMode:        "constant",
		PyroscopeProfileTypes:   []string{"cpu"},
		PyroscopeUploadInterval: 15,
	}

	tel, err := Setup(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("Setup enabled: %v", err)
	}
	if !tel.Enabled {
		t.Fatal("expected enabled telemetry")
	}
	if tel.OtelLogHandler != nil {
		t.Fatal("did not expect OTLP log handler when logs are disabled")
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}

func TestSetupLogsEnabled(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	cfg := config.Config{
		OtelEndpoint:            "localhost:4317",
		OtelInsecure:            true,
		MetricsEnabled:          false,
		MetricsExportInterval:   15,
		LogsEnabled:             true,
		PyroscopeEnabled:        false,
		TracesSampler:           "always_on",
		HTTPTracesMode:          "minimal",
		HTTPSpanNameMode:        "constant",
		PyroscopeProfileTypes:   []string{"cpu"},
		PyroscopeUploadInterval: 15,
	}

	tel, err := Setup(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("Setup logs enabled: %v", err)
	}
	if tel.OtelLogHandler == nil {
		t.Fatal("expected OTLP log handler when logs are enabled")
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}

func TestSetupMetricsEnabled(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	cfg := config.Config{
		OtelEndpoint:            "localhost:4317",
		OtelInsecure:            true,
		MetricsEnabled:          true,
		MetricsExportInterval:   25 * time.Millisecond,
		LogsEnabled:             false,
		PyroscopeEnabled:        false,
		TracesSampler:           "always_on",
		HTTPTracesMode:          "minimal",
		HTTPSpanNameMode:        "constant",
		PyroscopeProfileTypes:   []string{"cpu"},
		PyroscopeUploadInterval: 15 * time.Second,
	}

	tel, err := Setup(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("Setup metrics enabled: %v", err)
	}
	if !tel.Enabled {
		t.Fatal("expected enabled telemetry")
	}
}

func TestSetupPyroscopeFailureFallsBack(t *testing.T) {
	originalServiceName, serviceSet := os.LookupEnv("OTEL_SERVICE_NAME")
	if err := os.Setenv("OTEL_SERVICE_NAME", "go-test"); err != nil {
		t.Fatalf("Setenv OTEL_SERVICE_NAME: %v", err)
	}
	defer func() {
		if serviceSet {
			_ = os.Setenv("OTEL_SERVICE_NAME", originalServiceName)
		} else {
			_ = os.Unsetenv("OTEL_SERVICE_NAME")
		}
	}()

	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, &slog.HandlerOptions{Level: slog.LevelDebug}))
	cfg := config.Config{
		OtelEndpoint:             "localhost:4317",
		OtelInsecure:             true,
		MetricsEnabled:           false,
		MetricsExportInterval:    15 * time.Second,
		LogsEnabled:              false,
		PyroscopeEnabled:         true,
		PyroscopeServerAddress:   "://bad-address",
		PyroscopeApplicationName: "go-test",
		PyroscopeProfileTypes:    []string{"cpu"},
		PyroscopeUploadInterval:  15 * time.Second,
		PyroscopeLogLevel:        "info",
		TracesSampler:            "always_on",
		HTTPTracesMode:           "minimal",
		HTTPSpanNameMode:         "constant",
	}

	tel, err := Setup(context.Background(), cfg, logger)
	if err != nil {
		t.Fatalf("Setup pyroscope failure fallback: %v", err)
	}
	if !tel.Enabled {
		t.Fatal("expected enabled telemetry even when pyroscope start fails")
	}
	if err := tel.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
}

func TestFormattingSmoke(t *testing.T) {
	got := fmt.Sprintf("%T", &Telemetry{})
	if !strings.Contains(got, "Telemetry") {
		t.Fatalf("unexpected formatting: %q", got)
	}
}
