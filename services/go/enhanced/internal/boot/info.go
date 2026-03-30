// Package boot provides startup diagnostics, log-level parsing, and runtime info logging.
package boot

import (
	"fmt"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"runtime/metrics"
	"strconv"
	"strings"

	"hello/internal/config"
)

// ParseLogLevel converts a human-friendly log level string (debug, info, warn,
// error) into the corresponding slog.Level.
func ParseLogLevel(s string) slog.Level {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// LogBootInfo emits structured JSON log lines with runtime, cgroup, and
// configuration diagnostics. Each stat is a separate line so that log
// aggregators (e.g. Loki) can query them independently.
func LogBootInfo(logger *slog.Logger, cfg config.Config) {
	bootStat := func(name string, value any, extra ...any) {
		args := []any{
			slog.String("stat", name),
			slog.Any("value", value),
		}
		args = append(args, extra...)
		logger.Info("boot.stat", args...)
	}

	// --- Go version / build info ---
	buildInfo, ok := debug.ReadBuildInfo()
	goVersion := ""
	if ok {
		goVersion = buildInfo.GoVersion
	}
	bootStat("build.goversion", goVersion)

	// --- Effective runtime settings ---
	runtimeVer := runtime.Version()
	numCPU := runtime.NumCPU()

	// --- MemStats snapshot ---
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	// --- cgroup limits (v2 preferred, v1 fallback) ---
	memMaxRaw := readFirstExisting(
		"/sys/fs/cgroup/memory.max",                   // cgroup v2
		"/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
	)
	cpuMaxRaw := readFirstExisting("/sys/fs/cgroup/cpu.max") // cgroup v2

	// cgroup v1 CPU quota/period
	cpuQuotaRawV1 := readFirstExisting("/sys/fs/cgroup/cpu/cpu.cfs_quota_us")
	cpuPeriodRawV1 := readFirstExisting("/sys/fs/cgroup/cpu/cpu.cfs_period_us")

	cpuInfo := parseCgroupCPU(cpuMaxRaw, cpuQuotaRawV1, cpuPeriodRawV1)

	// --- Emit: one stat per JSON message ---
	bootStat("runtime.goversion", runtimeVer)

	bootStat("config.env", cfg.DeploymentEnv)
	bootStat("config.port", cfg.Port)

	bootStat("otel.endpoint", cfg.OtelEndpoint)
	bootStat("otel.http.traces_mode", cfg.HTTPTracesMode)
	bootStat("otel.http.enabled", cfg.HTTPMiddlewareEnabled)

	gogcEff, memLimitEffBytes, gomaxprocsEff, err := readRuntimeKnobs()
	if err != nil {
		logger.Warn("boot.runtime.knobs unavailable", slog.Any("err", err))
	} else {
		bootStat("runtime.gogc.effective", gogcEff)
		bootStat("runtime.gomemlimit.effective", bytesToMBOrUnlimited(memLimitEffBytes), slog.Uint64("bytes", memLimitEffBytes))
		bootStat("runtime.gomaxprocs.effective", gomaxprocsEff)
	}

	bootStat("runtime.numcpu.visible", numCPU)
	bootStat("runtime.goroutines", runtime.NumGoroutine())

	// Env knobs
	bootStat("env.GOMAXPROCS", os.Getenv("GOMAXPROCS"), slog.Bool("set", os.Getenv("GOMAXPROCS") != ""))
	bootStat("env.GOGC", os.Getenv("GOGC"), slog.Bool("set", os.Getenv("GOGC") != ""))
	bootStat("env.GOMEMLIMIT", os.Getenv("GOMEMLIMIT"), slog.Bool("set", os.Getenv("GOMEMLIMIT") != ""))
	bootStat("env.GODEBUG", os.Getenv("GODEBUG"), slog.Bool("set", os.Getenv("GODEBUG") != ""))
	bootStat("env.CACHE_IMPL", os.Getenv("CACHE_IMPL"))
	bootStat("env.CACHE_SIZE", os.Getenv("CACHE_SIZE"))

	// MemStats: each field separately, as MB
	bootStat("memstats.heap_alloc", FormatBytes(ms.HeapAlloc))
	bootStat("memstats.heap_sys", FormatBytes(ms.HeapSys))
	bootStat("memstats.heap_idle", FormatBytes(ms.HeapIdle))
	bootStat("memstats.heap_released", FormatBytes(ms.HeapReleased))
	bootStat("memstats.stack_inuse", FormatBytes(ms.StackInuse))

	bootStat("memstats.gc.num", uint64(ms.NumGC))
	bootStat("memstats.gc.pause_total_ms", float64(ms.PauseTotalNs)/1e6, slog.String("unit", "ms"))

	// cgroup memory: try to parse numeric → MB, otherwise keep raw ("max")
	bootStat("cgroup.memory.max_raw", strings.TrimSpace(memMaxRaw))
	if mb, ok := parseCgroupMemToMB(memMaxRaw); ok {
		bootStat("cgroup.memory.max", mb)
	}

	// cgroup cpu: raw + quota/period + derived ratio
	bootStat("cgroup.cpu.max_raw", strings.TrimSpace(cpuMaxRaw))

	if cpuInfo.HasQuotaPeriod {
		bootStat("cgroup.cpu.source", cpuInfo.Source)
		bootStat("cgroup.cpu.quota", cpuInfo.QuotaUS, slog.String("unit", "us"))
		bootStat("cgroup.cpu.period", cpuInfo.PeriodUS, slog.String("unit", "us"))
		bootStat("cgroup.cpu.quota_div_period", cpuInfo.QuotaDivPeriod)
		bootStat("cgroup.cpu.cpus", cpuInfo.CPUs)
	} else {
		bootStat("cgroup.cpu.source", "")
		bootStat("cgroup.cpu.quota", "", slog.Bool("set", false))
		bootStat("cgroup.cpu.period", "", slog.Bool("set", false))
		bootStat("cgroup.cpu.quota_div_period", "")
		bootStat("cgroup.cpu.cpus", "")
	}
}

// ---------- helpers ----------

func readRuntimeKnobs() (gogc uint64, gomemlimit uint64, gomaxprocs uint64, err error) {
	samples := []metrics.Sample{
		{Name: "/gc/gogc:percent"},
		{Name: "/gc/gomemlimit:bytes"},
		{Name: "/sched/gomaxprocs:threads"},
	}

	metrics.Read(samples)

	if samples[0].Value.Kind() == metrics.KindBad ||
		samples[1].Value.Kind() == metrics.KindBad ||
		samples[2].Value.Kind() == metrics.KindBad {
		return 0, 0, 0, fmt.Errorf("one or more runtime metrics are unavailable (bad kind); check Go version/metric names")
	}

	return samples[0].Value.Uint64(),
		samples[1].Value.Uint64(),
		samples[2].Value.Uint64(),
		nil
}

func bytesToMBOrUnlimited(v uint64) any {
	if v == 0 {
		return "unknown"
	}
	if v > (1 << 60) { // heuristic: huge = unlimited
		return "unlimited"
	}
	return FormatBytes(v)
}

func toFixed2(f float64) float64 {
	return math.Round(f*100) / 100
}

type cgroupCPUInfo struct {
	Source         string // "cgv2" | "cgv1" | ""
	QuotaUS        int64
	PeriodUS       int64
	QuotaDivPeriod any // float64 (e.g. 4.0) or "unlimited" or ""
	CPUs           any // same as QuotaDivPeriod; kept for readability
	HasQuotaPeriod bool
}

func parseCgroupCPU(cpuMaxRaw, quotaRawV1, periodRawV1 string) cgroupCPUInfo {
	cpuMaxRaw = strings.TrimSpace(cpuMaxRaw)
	if cpuMaxRaw != "" {
		parts := strings.Fields(cpuMaxRaw)
		if len(parts) == 2 {
			period, pErr := strconv.ParseInt(parts[1], 10, 64)
			if parts[0] == "max" && pErr == nil && period > 0 {
				return cgroupCPUInfo{
					Source:         "cgv2",
					QuotaUS:        -1,
					PeriodUS:       period,
					QuotaDivPeriod: "unlimited",
					CPUs:           "unlimited",
					HasQuotaPeriod: true,
				}
			}

			quota, qErr := strconv.ParseInt(parts[0], 10, 64)
			if qErr == nil && pErr == nil && quota > 0 && period > 0 {
				r := toFixed2(float64(quota) / float64(period))
				return cgroupCPUInfo{
					Source:         "cgv2",
					QuotaUS:        quota,
					PeriodUS:       period,
					QuotaDivPeriod: r,
					CPUs:           r,
					HasQuotaPeriod: true,
				}
			}
		}
	}

	// cgroup v1: quota/period
	quotaRawV1 = strings.TrimSpace(quotaRawV1)
	periodRawV1 = strings.TrimSpace(periodRawV1)
	quota, qErr := strconv.ParseInt(quotaRawV1, 10, 64)
	period, pErr := strconv.ParseInt(periodRawV1, 10, 64)

	if qErr == nil && pErr == nil && period > 0 {
		if quota < 0 {
			return cgroupCPUInfo{
				Source:         "cgv1",
				QuotaUS:        quota,
				PeriodUS:       period,
				QuotaDivPeriod: "unlimited",
				CPUs:           "unlimited",
				HasQuotaPeriod: true,
			}
		}
		if quota > 0 {
			r := toFixed2(float64(quota) / float64(period))
			return cgroupCPUInfo{
				Source:         "cgv1",
				QuotaUS:        quota,
				PeriodUS:       period,
				QuotaDivPeriod: r,
				CPUs:           r,
				HasQuotaPeriod: true,
			}
		}
	}

	return cgroupCPUInfo{}
}

func parseCgroupMemToMB(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "max" {
		return "0", false
	}
	v, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || v == 0 {
		return "0", false
	}
	return FormatBytes(v), true
}

func readFirstExisting(paths ...string) string {
	for _, p := range paths {
		b, err := os.ReadFile(filepath.Clean(p))
		if err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

// FormatBytes returns a human-readable string (e.g. "1.23GB", "456MB").
func FormatBytes(b uint64) string {
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)
	format := func(val float64) string {
		s := strconv.FormatFloat(val, 'f', 2, 64)
		if strings.HasSuffix(s, ".00") {
			return s[:len(s)-3]
		}
		return s
	}
	switch {
	case b >= GB:
		return format(float64(b)/GB) + "GB"
	case b >= MB:
		return format(float64(b)/MB) + "MB"
	case b >= KB:
		return format(float64(b)/KB) + "KB"
	default:
		return strconv.FormatUint(b, 10) + "B"
	}
}
