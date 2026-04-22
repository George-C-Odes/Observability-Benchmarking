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
- Go **1.26.x** (tested with Go 1.26.2)
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
- Traces and metrics are stable in OpenTelemetry Go; logs are still experimental/beta (this project keeps OTLP logs optional).
- The Fiber middleware (`otelfiber`) produces standard HTTP server spans and metrics out of the box.
- Runtime metrics (memory, GC, goroutines, etc.) are enabled via the OTel runtime instrumentation.

---

## Trace-to-profile correlation (Span Profiles)

This project supports Grafana's **Span Profiles** approach:
- Start Pyroscope profiling (Go push mode).
- Wrap the OTel TracerProvider with `otel-profiling-go` so profile samples are labeled with span IDs.

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

| Env var                        |  Default | Description                                             |
|--------------------------------|---------:|---------------------------------------------------------|
| `PORT`                         |   `8080` | HTTP port                                               |
| `CACHE_SIZE`                   |  `50000` | Size of pre-built cache                                 |
| `CACHE_IMPL`                   | `theine` | `slice`, `map`, `ristretto`, `theine`, or `otter`       |
| `LOG_LEVEL`                    |   `info` | `debug`, `info`, `warn`, `error`                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  |       `` | OTLP endpoint URL/host                                  |
| `OTEL_EXPORTER_OTLP_INSECURE`  |   `true` | Use insecure OTLP (common for local stacks)             |
| `OTEL_TRACES_SAMPLER_ARG`      |    `1.0` | Trace sampling ratio (0..1), used with `*traceidratio*` |
| `OTEL_METRICS_EXPORT_INTERVAL` |    `15s` | Metric export interval                                  |
| `OTEL_LOGS_ENABLED`            |  `false` | Export logs via OTLP (experimental)                     |
| `PYROSCOPE_SERVER_ADDRESS`     |       `` | Enables Pyroscope push mode                             |
| `PYROSCOPE_APPLICATION_NAME`   |       `` | Pyroscope app name                                      |

---

## Build

### Tests
```bash
go test ./... -race
```

### Docker
```bash
docker build -t go:1.26.2_latest .
docker run --rm -p 8080:8080 go:1.26.2_latest
```

---

## Local quality checks

This module is fully wired into the repository's Go quality and coverage
workflows, and the local commands below mirror those CI checks closely.

### Direct commands

```bash
cd services/go/enhanced
go mod download
go vet ./...
golangci-lint run
go test ./... -race -count=1
go build ./cmd/server

# Optional parity with the non-blocking CI vuln scan
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Coverage
go test ./... -race -count=1 -coverprofile=coverage.out -covermode=atomic
go tool cover -func=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

### Makefile shortcuts

```bash
cd services/go/enhanced
make lint
make test
make coverage
```

## CI, reporting, and coverage

- **Lint / quality workflow**: `.github/workflows/go_quality.yml`
  - verifies `go.mod` / `go.sum` tidiness, then runs `go vet`, `golangci-lint run`, `go test -race`, `go build`, and `govulncheck`
  - uploads a hosted HTML quality report artifact: `quality-report-go`
- **Coverage workflow**: `.github/workflows/go_coverage.yml`
  - runs `go test -race -coverprofile=coverage.out -covermode=atomic`
  - uploads `coverage.out` and `coverage.html`
  - rewrites coverage paths into `coverage-codecov.out` before uploading to Codecov
  - enforces the current enhanced-module statement threshold of **40%**
- **Codecov flag**: `go-enhanced`
  - mapped in the repository root `codecov.yml` to `services/go/enhanced/`

Hosted report URL on GitHub Pages:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/go/
```

## Testing notes

The current unit tests cover:

- handler behavior for `/hello/virtual`
- query parameter parsing and validation (`sleep`, `log`, bad values)
- cache implementations and hit/miss behavior
- configuration parsing from environment variables
- logging and trace-correlation helpers
- HTTP tracing middleware utilities
- OpenTelemetry and Pyroscope setup using deterministic test doubles where needed

If your local Windows Go toolchain has filesystem-permission issues with the
managed toolchain cache or C toolchain headers, run the same commands in Docker
instead. The GitHub Actions workflows run on Linux and remain the source of
truth for `-race`, build, and coverage parity.

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
