package boot

import (
	"bytes"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hello/internal/config"
)

func TestParseLogLevel(t *testing.T) {
	cases := []struct {
		input string
		want  slog.Level
	}{
		{input: "debug", want: slog.LevelDebug},
		{input: " warn ", want: slog.LevelWarn},
		{input: "warning", want: slog.LevelWarn},
		{input: "error", want: slog.LevelError},
		{input: "info", want: slog.LevelInfo},
		{input: "unknown", want: slog.LevelInfo},
	}
	for _, tc := range cases {
		if got := ParseLogLevel(tc.input); got != tc.want {
			t.Fatalf("ParseLogLevel(%q) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

func TestHelperFormatting(t *testing.T) {
	if got := bytesToMBOrUnlimited(0); got != "unknown" {
		t.Fatalf("unexpected unknown value: %v", got)
	}
	if got := bytesToMBOrUnlimited(1 << 61); got != "unlimited" {
		t.Fatalf("unexpected unlimited value: %v", got)
	}
	if got := bytesToMBOrUnlimited(5 * 1024 * 1024); got != "5MB" {
		t.Fatalf("unexpected formatted bytes: %v", got)
	}
	if got := toFixed2(1.234); got != 1.23 {
		t.Fatalf("unexpected fixed rounding: %v", got)
	}
	if got := FormatBytes(512); got != "512B" {
		t.Fatalf("unexpected bytes formatting: %q", got)
	}
	if got := FormatBytes(5 * 1024); got != "5KB" {
		t.Fatalf("unexpected KB formatting: %q", got)
	}
	if got := FormatBytes(3 * 1024 * 1024); got != "3MB" {
		t.Fatalf("unexpected MB formatting: %q", got)
	}
	if got := FormatBytes(2 * 1024 * 1024 * 1024); got != "2GB" {
		t.Fatalf("unexpected GB formatting: %q", got)
	}
}

func TestParseCgroupCPU(t *testing.T) {
	info := parseCgroupCPU("max 100000", "", "")
	if info.Source != "cgv2" || info.QuotaDivPeriod != "unlimited" || !info.HasQuotaPeriod {
		t.Fatalf("unexpected cgroup v2 unlimited info: %#v", info)
	}

	info = parseCgroupCPU("200000 100000", "", "")
	if info.Source != "cgv2" || info.QuotaUS != 200000 || info.PeriodUS != 100000 || info.CPUs != 2.0 {
		t.Fatalf("unexpected cgroup v2 quota info: %#v", info)
	}

	info = parseCgroupCPU("", "-1", "100000")
	if info.Source != "cgv1" || info.CPUs != "unlimited" || !info.HasQuotaPeriod {
		t.Fatalf("unexpected cgroup v1 unlimited info: %#v", info)
	}

	info = parseCgroupCPU("", "250000", "100000")
	if info.Source != "cgv1" || info.CPUs != 2.5 {
		t.Fatalf("unexpected cgroup v1 quota info: %#v", info)
	}

	info = parseCgroupCPU("garbage", "bad", "stillbad")
	if info.HasQuotaPeriod {
		t.Fatalf("expected empty cgroup CPU info, got %#v", info)
	}
}

func TestParseCgroupMemToMB(t *testing.T) {
	if got, ok := parseCgroupMemToMB("1048576"); !ok || got != "1MB" {
		t.Fatalf("unexpected cgroup mem conversion: got %q ok=%v", got, ok)
	}
	for _, raw := range []string{"", "max", "0", "bad"} {
		if got, ok := parseCgroupMemToMB(raw); ok || got != "0" {
			t.Fatalf("expected parse failure for %q, got %q ok=%v", raw, got, ok)
		}
	}
}

func TestReadFirstExisting(t *testing.T) {
	dir := t.TempDir()
	missing := filepath.Join(dir, "missing.txt")
	existing := filepath.Join(dir, "value.txt")
	if err := os.WriteFile(existing, []byte("  hello\n"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if got := readFirstExisting(missing, existing); got != "hello" {
		t.Fatalf("readFirstExisting returned %q", got)
	}
	if got := readFirstExisting(missing); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}

func TestReadRuntimeKnobs(t *testing.T) {
	gogc, gomemlimit, gomaxprocs, err := readRuntimeKnobs()
	if err != nil {
		t.Fatalf("readRuntimeKnobs: %v", err)
	}
	if gogc == 0 || gomaxprocs == 0 || gomemlimit == 0 {
		t.Fatalf("unexpected runtime knobs: gogc=%d gomemlimit=%d gomaxprocs=%d", gogc, gomemlimit, gomaxprocs)
	}
}

func TestLogBootInfo(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))

	LogBootInfo(logger, config.Config{
		DeploymentEnv:         "test",
		Port:                  8080,
		OtelEndpoint:          "collector:4317",
		HTTPTracesMode:        "minimal",
		HTTPMiddlewareEnabled: true,
	})

	output := buf.String()
	for _, snippet := range []string{"boot.stat", "build.goversion", "runtime.goversion", "config.port", "otel.endpoint"} {
		if !strings.Contains(output, snippet) {
			t.Fatalf("expected boot output to contain %q, got %q", snippet, output)
		}
	}
}
