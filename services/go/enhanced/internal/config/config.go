package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is loaded from environment variables.
// Keep defaults biased toward *benchmark performance* (you can opt-in more telemetry when needed).
type Config struct {
	Host          string
	Port          int
	DeploymentEnv string

	LogLevel string

	CacheImpl string
	CacheSize int

	// --- OpenTelemetry ---
	OtelEndpoint string // OTEL_EXPORTER_OTLP_ENDPOINT (host:port) or URL
	OtelInsecure bool   // OTEL_EXPORTER_OTLP_INSECURE=true

	TracesSampler    string  // OTEL_TRACES_SAMPLER (e.g. parentbased_always_on, parentbased_traceidratio, always_off, traceidratio)
	TracesSamplerArg float64 // OTEL_TRACES_SAMPLER_ARG (used for *traceidratio*)

	MetricsEnabled        bool          // OTEL_METRICS_ENABLED (default true)
	MetricsExportInterval time.Duration // OTEL_METRIC_EXPORT_INTERVAL / OTEL_METRICS_EXPORT_INTERVAL (default 15s)

	// Runtime metrics can add measurable overhead under high RPS; keep opt-in.
	RuntimeMetricsEnabled    bool // OTEL_RUNTIME_METRICS_ENABLED (default false)
	GoScheduleMetricsEnabled bool // OTEL_GO_SCHEDULE_METRICS_ENABLED (default false)

	LogsEnabled bool // OTEL_LOGS_ENABLED (default false)

	// --- HTTP instrumentation (Fiber) ---
	HTTPMiddlewareEnabled  bool     // OTEL_HTTP_ENABLED (default true)
	HTTPTracesEnabled      bool     // OTEL_HTTP_TRACES_ENABLED (default true)
	HTTPMetricsEnabled     bool     // OTEL_HTTP_METRICS_ENABLED (default false)
	HTTPCollectClientIP    bool     // OTEL_HTTP_COLLECT_CLIENT_IP (default false)
	HTTPIgnorePaths        []string // OTEL_HTTP_IGNORE_PATHS (csv)
	HTTPSpanNameMode       string   // OTEL_HTTP_SPAN_NAME_MODE (constant|method|route|path|method_route|method_path)
	HTTPPropagationEnabled bool     // OTEL_HTTP_PROPAGATION_ENABLED (default true)
	HTTPTracesMode         string   // OTEL_HTTP_TRACES_MODE (otelfiber|minimal)

	// --- App-level instrumentation ---
	HandlerSpansEnabled bool // APP_HANDLER_SPANS_ENABLED (default false)

	// --- Pyroscope (span profiles) ---
	PyroscopeEnabled         bool          // PYROSCOPE_ENABLED (default: true if address+app name set)
	PyroscopeServerAddress   string        // PYROSCOPE_SERVER_ADDRESS
	PyroscopeApplicationName string        // PYROSCOPE_APPLICATION_NAME
	PyroscopeProfileTypes    []string      // PYROSCOPE_PROFILE_TYPES (csv)
	PyroscopeUploadInterval  time.Duration // PYROSCOPE_UPLOAD_INTERVAL (default 15s)
	PyroscopeLogLevel        string        // PYROSCOPE_LOG_LEVEL (debug|info|warn|error|off)
}

func LoadFromEnv() (Config, error) {
	cfg := Config{
		Host:          getenv("HOST", "0.0.0.0"),
		Port:          getenvInt("PORT", 8080),
		DeploymentEnv: getenv("DEPLOYMENT_ENV", "dev"),

		LogLevel: getenv("LOG_LEVEL", "info"),

		CacheImpl: getenv("CACHE_IMPL", "map"),
		CacheSize: getenvInt("CACHE_SIZE", 50000),

		OtelEndpoint: getenv("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
		OtelInsecure: getenvBool("OTEL_EXPORTER_OTLP_INSECURE", true),

		TracesSampler:    strings.ToLower(strings.TrimSpace(getenv("OTEL_TRACES_SAMPLER", "parentbased_always_on"))),
		TracesSamplerArg: getenvFloat("OTEL_TRACES_SAMPLER_ARG", 1.0),

		MetricsEnabled: getenvBool("OTEL_METRICS_ENABLED", true),

		RuntimeMetricsEnabled:    getenvBool("OTEL_RUNTIME_METRICS_ENABLED", false),
		GoScheduleMetricsEnabled: getenvBool("OTEL_GO_SCHEDULE_METRICS_ENABLED", false),

		LogsEnabled: getenvBool("OTEL_LOGS_ENABLED", false),

		HTTPMiddlewareEnabled:  getenvBool("OTEL_HTTP_ENABLED", true),
		HTTPTracesEnabled:      getenvBool("OTEL_HTTP_TRACES_ENABLED", true),
		HTTPMetricsEnabled:     getenvBool("OTEL_HTTP_METRICS_ENABLED", false),
		HTTPCollectClientIP:    getenvBool("OTEL_HTTP_COLLECT_CLIENT_IP", false),
		HTTPIgnorePaths:        splitCSV(getenv("OTEL_HTTP_IGNORE_PATHS", "/healthz,/readyz,/livez")),
		HTTPSpanNameMode:       strings.ToLower(strings.TrimSpace(getenv("OTEL_HTTP_SPAN_NAME_MODE", "constant"))),
		HTTPPropagationEnabled: getenvBool("OTEL_HTTP_PROPAGATION_ENABLED", true),
		HTTPTracesMode:         strings.ToLower(strings.TrimSpace(getenv("OTEL_HTTP_TRACES_MODE", "otelfiber"))),

		HandlerSpansEnabled: getenvBool("APP_HANDLER_SPANS_ENABLED", false),

		PyroscopeServerAddress:   getenv("PYROSCOPE_SERVER_ADDRESS", ""),
		PyroscopeApplicationName: getenv("PYROSCOPE_APPLICATION_NAME", ""),
		PyroscopeProfileTypes:    splitCSV(getenv("PYROSCOPE_PROFILE_TYPES", "cpu")),
		PyroscopeLogLevel:        strings.ToLower(strings.TrimSpace(getenv("PYROSCOPE_LOG_LEVEL", "info"))),
	}

	// Metrics export interval: accept BOTH (plural/singular) because people mix them up.
	intervalRaw := firstNonEmpty(
		os.Getenv("OTEL_METRIC_EXPORT_INTERVAL"),
		os.Getenv("OTEL_METRICS_EXPORT_INTERVAL"),
	)
	if strings.TrimSpace(intervalRaw) == "" {
		cfg.MetricsExportInterval = 15 * time.Second
	} else {
		d, err := parseDurationFlex(intervalRaw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid OTEL_*METRIC*_EXPORT_INTERVAL=%q: %w", intervalRaw, err)
		}
		cfg.MetricsExportInterval = d
	}

	// Pyroscope enablement: explicit switch wins, otherwise enable only when address+app name exist.
	if v, ok := os.LookupEnv("PYROSCOPE_ENABLED"); ok {
		cfg.PyroscopeEnabled = parseBoolLoose(v, false)
	} else {
		cfg.PyroscopeEnabled = strings.TrimSpace(cfg.PyroscopeServerAddress) != "" && strings.TrimSpace(cfg.PyroscopeApplicationName) != ""
	}

	uploadRaw := firstNonEmpty(os.Getenv("PYROSCOPE_UPLOAD_INTERVAL"))
	if strings.TrimSpace(uploadRaw) == "" {
		cfg.PyroscopeUploadInterval = 15 * time.Second
	} else {
		d, err := parseDurationFlex(uploadRaw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid PYROSCOPE_UPLOAD_INTERVAL=%q: %w", uploadRaw, err)
		}
		cfg.PyroscopeUploadInterval = d
	}

	// Validate modes early (fail fast on typos)
	switch cfg.HTTPTracesMode {
	case "otelfiber", "minimal":
	default:
		return Config{}, fmt.Errorf("invalid OTEL_HTTP_TRACES_MODE=%q (valid: otelfiber|minimal)", cfg.HTTPTracesMode)
	}

	switch cfg.HTTPSpanNameMode {
	case "constant", "method", "route", "path", "method_route", "method_path":
	default:
		return Config{}, fmt.Errorf("invalid OTEL_HTTP_SPAN_NAME_MODE=%q (valid: constant|method|route|path|method_route|method_path)", cfg.HTTPSpanNameMode)
	}

	return cfg, nil
}

func getenv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func getenvFloat(key string, def float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return def
	}
	return f
}

func getenvBool(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok {
		return def
	}
	return parseBoolLoose(v, def)
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

func splitCSV(v string) []string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// parseDurationFlex accepts:
//   - Go durations: "15s", "150ms", "1m"
//   - integer milliseconds: "15000"
//   - Go-constant-ish: "0.15*time.Second" (helpful when copy-pasted from code)
func parseDurationFlex(s string) (time.Duration, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty duration")
	}
	if d, err := time.ParseDuration(s); err == nil {
		return d, nil
	}
	// pure integer => milliseconds
	if n, err := strconv.Atoi(s); err == nil {
		return time.Duration(n) * time.Millisecond, nil
	}
	// support "<float>*time.<Unit>"
	if strings.Contains(s, "*time.") {
		parts := strings.SplitN(s, "*time.", 2)
		if len(parts) != 2 {
			return 0, fmt.Errorf("invalid duration %q", s)
		}
		f, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		if err != nil {
			return 0, fmt.Errorf("invalid duration %q", s)
		}
		unit := strings.TrimSpace(parts[1])
		switch unit {
		case "Nanosecond":
			return time.Duration(f * float64(time.Nanosecond)), nil
		case "Microsecond":
			return time.Duration(f * float64(time.Microsecond)), nil
		case "Millisecond":
			return time.Duration(f * float64(time.Millisecond)), nil
		case "Second":
			return time.Duration(f * float64(time.Second)), nil
		case "Minute":
			return time.Duration(f * float64(time.Minute)), nil
		case "Hour":
			return time.Duration(f * float64(time.Hour)), nil
		default:
			return 0, fmt.Errorf("unknown time unit %q", unit)
		}
	}
	return 0, fmt.Errorf("unsupported duration format %q", s)
}
