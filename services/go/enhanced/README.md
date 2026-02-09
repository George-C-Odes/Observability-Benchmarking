# Go Load-Test Target Service

A small, **high-performance** HTTP service designed to be an excellent target for load-testing while showcasing **production-grade OpenTelemetry** instrumentation and a **Grafana LGTM+** stack (Loki, Grafana, Tempo, Mimir) plus **Pyroscope** profiling.

Highlights:
- Clean structure and SOLID-friendly boundaries (config / telemetry / server / handlers).
- Fast HTTP stack (**Fiber**).
- Best-practice OpenTelemetry for **traces + metrics** (and optional **logs**).
- Optional **trace-to-profile** correlation using Grafana's **Span Profiles** (Pyroscope + `otel-profiling-go`).

---

## Endpoints

### `GET /hello/virtual`
Returns `hello virtual`.

Optional query parameters:
- `log` (bool, default: `false`)  
  When enabled, logs a small message containing goroutine info:
  `goroutine thread : <id> ...`
- `sleep` (int seconds, default: `0`)  
  Sleeps for the requested number of seconds before completing the request.

Example:
```
/hello/virtual?log=true&sleep=1
```

### Health
- `GET /healthz` → 200 when running

---

## Quick start (local)

### Prerequisites
- Go **1.25.x** (tested with Go 1.25.7)
- Docker (optional)

### Run

> First time setup: run `go mod tidy` to generate an up-to-date `go.sum`.

```bash
export PORT=8080
go run ./cmd/server
```

Then:
```bash
curl "http://localhost:8080/hello/virtual?log=true&sleep=1"
```

---

## Run with Grafana Alloy (OTLP)

This service exports telemetry using OTLP/gRPC.

Minimal env:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://alloy:4317"
export OTEL_EXPORTER_OTLP_INSECURE="true"
export OTEL_SERVICE_NAME="go"
export DEPLOYMENT_ENV="local"
```

Notes:
- Traces + metrics are stable in OpenTelemetry Go; logs are still experimental/beta (this project keeps OTLP logs optional).
- The Fiber middleware (`otelfiber`) produces standard HTTP server spans and metrics out of the box.
- Runtime metrics (memory, GC, goroutines, etc.) are enabled via the OTel runtime instrumentation.

---

## Trace-to-profile correlation (Span Profiles)

This project supports Grafana's **Span Profiles** approach:
- Start Pyroscope profiling (Go push mode).
- Wrap the OTel TracerProvider with `otel-profiling-go` so profile samples are labelled with span IDs.

Guide:
https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/go-span-profiles/

Enable:
```bash
export PYROSCOPE_SERVER_ADDRESS="http://pyroscope:4040"
export PYROSCOPE_APPLICATION_NAME="agent/go"
# Optional: "cpu,alloc,inuse,goroutines,mutex,block"
export PYROSCOPE_PROFILE_TYPES="cpu,alloc,inuse,goroutines"
```

---

## Configuration

| Env var | Default | Description |
|---|---:|---|
| `PORT` | `8080` | HTTP port |
| `CACHE_SIZE` | `50000` | Size of pre-built cache |
| `CACHE_IMPL` | `slice` | `slice` (fast for sequential keys) or `map` |
| `MAX_SLEEP_SECONDS` | `10` | Upper bound for `sleep` query param |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `` | OTLP endpoint URL/host |
| `OTEL_EXPORTER_OTLP_INSECURE` | `true` | Use insecure OTLP (common for local stacks) |
| `OTEL_TRACES_SAMPLER_RATIO` | `1.0` | Trace sampling ratio (0..1) |
| `OTEL_METRICS_EXPORT_INTERVAL` | `5s` | Metric export interval |
| `OTEL_LOGS_ENABLED` | `false` | Export logs via OTLP (experimental) |
| `PYROSCOPE_SERVER_ADDRESS` | `` | Enables Pyroscope push mode |
| `PYROSCOPE_APPLICATION_NAME` | `` | Pyroscope app name |

---

## Build

### Tests
```bash
go test ./... -race
```

### Docker
```bash
docker build -t go:1.25.7_latest .
docker run --rm -p 8080:8080 go:1.25.7_latest
```

---

## Project layout

```
cmd/server/                 # entrypoint
internal/config/            # env parsing + defaults
internal/otel/              # OTel + Pyroscope setup (batching, resources)
internal/logging/           # slog helpers + trace correlation
internal/cache/             # cache implementations (slice/map)
internal/handlers/          # HTTP handlers + unit tests
```
