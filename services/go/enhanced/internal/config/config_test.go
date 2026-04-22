package config

import (
	"os"
	"testing"
	"time"
)

func setTestEnv(t *testing.T, key, value string) {
	t.Helper()
	original, existed := os.LookupEnv(key)
	if err := os.Setenv(key, value); err != nil {
		t.Fatalf("Setenv(%s): %v", key, err)
	}
	t.Cleanup(func() {
		var err error
		if existed {
			err = os.Setenv(key, original)
		} else {
			err = os.Unsetenv(key)
		}
		if err != nil {
			t.Fatalf("restore env %s: %v", key, err)
		}
	})
}

func unsetTestEnv(t *testing.T, key string) {
	t.Helper()
	original, existed := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("Unsetenv(%s): %v", key, err)
	}
	t.Cleanup(func() {
		var err error
		if existed {
			err = os.Setenv(key, original)
		} else {
			err = os.Unsetenv(key)
		}
		if err != nil {
			t.Fatalf("restore env %s: %v", key, err)
		}
	})
}

func TestParseBoolLoose(t *testing.T) {
	cases := []struct {
		name  string
		value string
		def   bool
		want  bool
	}{
		{name: "trimmed true", value: " TRUE ", def: false, want: true},
		{name: "trimmed false", value: " false ", def: true, want: false},
		{name: "empty uses default", value: "  ", def: true, want: true},
		{name: "invalid uses default", value: "maybe", def: false, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ParseBoolLoose(tc.value, tc.def); got != tc.want {
				t.Fatalf("ParseBoolLoose(%q, %v) = %v, want %v", tc.value, tc.def, got, tc.want)
			}
		})
	}
}

func TestHelpers(t *testing.T) {
	setTestEnv(t, "CFG_STRING", "  value  ")
	setTestEnv(t, "CFG_INT", "42")
	setTestEnv(t, "CFG_INT_BAD", "bad")
	setTestEnv(t, "CFG_FLOAT", "0.25")
	setTestEnv(t, "CFG_FLOAT_BAD", "nope")
	setTestEnv(t, "CFG_BOOL", "true")
	unsetTestEnv(t, "CFG_MISSING")

	if got := getenv("CFG_STRING", "fallback"); got != "value" {
		t.Fatalf("getenv returned %q", got)
	}
	if got := getenv("CFG_MISSING", "fallback"); got != "fallback" {
		t.Fatalf("getenv missing returned %q", got)
	}
	if got := getenvInt("CFG_INT", 7); got != 42 {
		t.Fatalf("getenvInt returned %d", got)
	}
	if got := getenvInt("CFG_INT_BAD", 7); got != 7 {
		t.Fatalf("getenvInt bad returned %d", got)
	}
	if got := getenvFloat("CFG_FLOAT", 1.5); got != 0.25 {
		t.Fatalf("getenvFloat returned %v", got)
	}
	if got := getenvFloat("CFG_FLOAT_BAD", 1.5); got != 1.5 {
		t.Fatalf("getenvFloat bad returned %v", got)
	}
	if got := getenvBool("CFG_BOOL", false); !got {
		t.Fatal("getenvBool should parse true")
	}
	if got := getenvBool("CFG_MISSING", true); !got {
		t.Fatal("getenvBool should use default for missing key")
	}
}

func TestSplitCSVAndFirstNonEmpty(t *testing.T) {
	parts := splitCSV(" /healthz , , /readyz , /livez ")
	if len(parts) != 3 || parts[0] != "/healthz" || parts[1] != "/readyz" || parts[2] != "/livez" {
		t.Fatalf("unexpected splitCSV output: %#v", parts)
	}
	if got := splitCSV("   "); got != nil {
		t.Fatalf("expected nil for empty CSV, got %#v", got)
	}
	if got := firstNonEmpty("  ", "", " value "); got != " value " {
		t.Fatalf("firstNonEmpty returned %q", got)
	}
	if got := firstNonEmpty(" ", "\t"); got != "" {
		t.Fatalf("expected empty firstNonEmpty result, got %q", got)
	}
}

func TestParseDurationFlex(t *testing.T) {
	cases := []struct {
		input string
		want  time.Duration
	}{
		{input: "15s", want: 15 * time.Second},
		{input: "150", want: 150 * time.Millisecond},
		{input: "0.5*time.Second", want: 500 * time.Millisecond},
		{input: "2*time.Minute", want: 2 * time.Minute},
	}

	for _, tc := range cases {
		got, err := parseDurationFlex(tc.input)
		if err != nil {
			t.Fatalf("parseDurationFlex(%q): %v", tc.input, err)
		}
		if got != tc.want {
			t.Fatalf("parseDurationFlex(%q) = %v, want %v", tc.input, got, tc.want)
		}
	}

	for _, input := range []string{"", "abc", "1*time.Fortnight"} {
		if _, err := parseDurationFlex(input); err == nil {
			t.Fatalf("expected error for %q", input)
		}
	}
}

func TestLoadFromEnvDefaults(t *testing.T) {
	for _, key := range []string{
		"HOST", "PORT", "DEPLOYMENT_ENV", "LOG_LEVEL", "CACHE_IMPL", "CACHE_SIZE",
		"OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_INSECURE", "OTEL_TRACES_SAMPLER",
		"OTEL_TRACES_SAMPLER_ARG", "OTEL_METRICS_ENABLED", "OTEL_RUNTIME_METRICS_ENABLED",
		"OTEL_GO_SCHEDULE_METRICS_ENABLED", "OTEL_LOGS_ENABLED", "OTEL_HTTP_ENABLED",
		"OTEL_HTTP_TRACES_ENABLED", "OTEL_HTTP_METRICS_ENABLED", "OTEL_HTTP_COLLECT_CLIENT_IP",
		"OTEL_HTTP_IGNORE_PATHS", "OTEL_HTTP_SPAN_NAME_MODE", "OTEL_HTTP_PROPAGATION_ENABLED",
		"OTEL_HTTP_TRACES_MODE", "APP_HANDLER_SPANS_ENABLED", "PYROSCOPE_ENABLED",
		"PYROSCOPE_SERVER_ADDRESS", "PYROSCOPE_APPLICATION_NAME", "PYROSCOPE_PROFILE_TYPES",
		"PYROSCOPE_UPLOAD_INTERVAL", "PYROSCOPE_LOG_LEVEL", "OTEL_METRIC_EXPORT_INTERVAL",
		"OTEL_METRICS_EXPORT_INTERVAL",
	} {
		unsetTestEnv(t, key)
	}

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv: %v", err)
	}

	if cfg.Host != "0.0.0.0" || cfg.Port != 8080 || cfg.CacheImpl != "theine" || cfg.CacheSize != 50000 {
		t.Fatalf("unexpected defaults: %#v", cfg)
	}
	if cfg.MetricsExportInterval != 15*time.Second || cfg.PyroscopeUploadInterval != 15*time.Second {
		t.Fatalf("unexpected duration defaults: %#v", cfg)
	}
	if cfg.HTTPTracesMode != "otelfiber" || cfg.HTTPSpanNameMode != "constant" {
		t.Fatalf("unexpected HTTP defaults: %#v", cfg)
	}
	if cfg.PyroscopeEnabled {
		t.Fatal("pyroscope should be disabled by default")
	}
}

func TestLoadFromEnvOverrides(t *testing.T) {
	setTestEnv(t, "HOST", "127.0.0.1")
	setTestEnv(t, "PORT", "9090")
	setTestEnv(t, "DEPLOYMENT_ENV", "prod")
	setTestEnv(t, "LOG_LEVEL", "warn")
	setTestEnv(t, "CACHE_IMPL", "map")
	setTestEnv(t, "CACHE_SIZE", "123")
	setTestEnv(t, "OTEL_EXPORTER_OTLP_ENDPOINT", "collector:4317")
	setTestEnv(t, "OTEL_EXPORTER_OTLP_INSECURE", "false")
	setTestEnv(t, "OTEL_TRACES_SAMPLER", "parentbased_traceidratio")
	setTestEnv(t, "OTEL_TRACES_SAMPLER_ARG", "0.4")
	setTestEnv(t, "OTEL_METRICS_ENABLED", "false")
	setTestEnv(t, "OTEL_RUNTIME_METRICS_ENABLED", "true")
	setTestEnv(t, "OTEL_GO_SCHEDULE_METRICS_ENABLED", "true")
	setTestEnv(t, "OTEL_LOGS_ENABLED", "true")
	setTestEnv(t, "OTEL_HTTP_ENABLED", "false")
	setTestEnv(t, "OTEL_HTTP_TRACES_ENABLED", "false")
	setTestEnv(t, "OTEL_HTTP_METRICS_ENABLED", "true")
	setTestEnv(t, "OTEL_HTTP_COLLECT_CLIENT_IP", "true")
	setTestEnv(t, "OTEL_HTTP_IGNORE_PATHS", " /a , /b* ")
	setTestEnv(t, "OTEL_HTTP_SPAN_NAME_MODE", "method_route")
	setTestEnv(t, "OTEL_HTTP_PROPAGATION_ENABLED", "false")
	setTestEnv(t, "OTEL_HTTP_TRACES_MODE", "minimal")
	setTestEnv(t, "APP_HANDLER_SPANS_ENABLED", "true")
	setTestEnv(t, "PYROSCOPE_SERVER_ADDRESS", "http://pyroscope:4040")
	setTestEnv(t, "PYROSCOPE_APPLICATION_NAME", "agent/go")
	setTestEnv(t, "PYROSCOPE_PROFILE_TYPES", "cpu, alloc, goroutines")
	setTestEnv(t, "PYROSCOPE_UPLOAD_INTERVAL", "2*time.Second")
	setTestEnv(t, "PYROSCOPE_LOG_LEVEL", "debug")
	setTestEnv(t, "OTEL_METRIC_EXPORT_INTERVAL", "250ms")

	cfg, err := LoadFromEnv()
	if err != nil {
		t.Fatalf("LoadFromEnv: %v", err)
	}

	if cfg.Host != "127.0.0.1" || cfg.Port != 9090 || cfg.DeploymentEnv != "prod" {
		t.Fatalf("unexpected address config: %#v", cfg)
	}
	if cfg.CacheImpl != "map" || cfg.CacheSize != 123 {
		t.Fatalf("unexpected cache config: %#v", cfg)
	}
	if cfg.OtelEndpoint != "collector:4317" || cfg.OtelInsecure {
		t.Fatalf("unexpected OTEL endpoint config: %#v", cfg)
	}
	if cfg.TracesSampler != "parentbased_traceidratio" || cfg.TracesSamplerArg != 0.4 {
		t.Fatalf("unexpected trace sampler config: %#v", cfg)
	}
	if cfg.MetricsEnabled || !cfg.RuntimeMetricsEnabled || !cfg.GoScheduleMetricsEnabled || !cfg.LogsEnabled {
		t.Fatalf("unexpected metrics/log config: %#v", cfg)
	}
	if cfg.HTTPMiddlewareEnabled || cfg.HTTPTracesEnabled || !cfg.HTTPMetricsEnabled || !cfg.HTTPCollectClientIP {
		t.Fatalf("unexpected HTTP middleware config: %#v", cfg)
	}
	if len(cfg.HTTPIgnorePaths) != 2 || cfg.HTTPIgnorePaths[0] != "/a" || cfg.HTTPIgnorePaths[1] != "/b*" {
		t.Fatalf("unexpected ignore paths: %#v", cfg.HTTPIgnorePaths)
	}
	if cfg.HTTPSpanNameMode != "method_route" || cfg.HTTPTracesMode != "minimal" || cfg.HTTPPropagationEnabled {
		t.Fatalf("unexpected HTTP tracing config: %#v", cfg)
	}
	if !cfg.HandlerSpansEnabled {
		t.Fatal("handler spans should be enabled")
	}
	if !cfg.PyroscopeEnabled || cfg.PyroscopeUploadInterval != 2*time.Second || cfg.PyroscopeLogLevel != "debug" {
		t.Fatalf("unexpected pyroscope config: %#v", cfg)
	}
	if cfg.MetricsExportInterval != 250*time.Millisecond {
		t.Fatalf("unexpected metrics export interval: %v", cfg.MetricsExportInterval)
	}
}

func TestLoadFromEnvValidationErrors(t *testing.T) {
	setTestEnv(t, "OTEL_METRIC_EXPORT_INTERVAL", "not-a-duration")
	if _, err := LoadFromEnv(); err == nil {
		t.Fatal("expected error for invalid OTEL metric export interval")
	}

	setTestEnv(t, "OTEL_METRIC_EXPORT_INTERVAL", "")
	setTestEnv(t, "PYROSCOPE_UPLOAD_INTERVAL", "still-bad")
	if _, err := LoadFromEnv(); err == nil {
		t.Fatal("expected error for invalid pyroscope upload interval")
	}

	setTestEnv(t, "PYROSCOPE_UPLOAD_INTERVAL", "1s")
	setTestEnv(t, "OTEL_HTTP_TRACES_MODE", "weird")
	if _, err := LoadFromEnv(); err == nil {
		t.Fatal("expected error for invalid OTEL_HTTP_TRACES_MODE")
	}

	setTestEnv(t, "OTEL_HTTP_TRACES_MODE", "minimal")
	setTestEnv(t, "OTEL_HTTP_SPAN_NAME_MODE", "bad-mode")
	if _, err := LoadFromEnv(); err == nil {
		t.Fatal("expected error for invalid OTEL_HTTP_SPAN_NAME_MODE")
	}
}
