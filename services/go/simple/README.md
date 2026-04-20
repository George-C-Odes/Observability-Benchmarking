# Go Simple Service

## Overview

`services/go/simple` is the smallest Go load-target in the repository. It keeps
the implementation intentionally compact while still exporting OpenTelemetry
metrics and traces, making it a useful baseline beside the richer
`services/go/enhanced` module.

## Runtime

- **Language**: Go 1.26.2
- **HTTP framework**: Fiber v3.1.0
- **Telemetry**: OpenTelemetry OTLP/gRPC for metrics and traces
- **Cache model**: in-memory `map[int]int`, pre-populated at startup

## Endpoint

### `GET /hello/virtual`

Looks up key `1` from the in-memory cache and returns a plain-text response.

- **200 OK** → `Hello from GO-simple REST 1`
- **404 Not Found** → `value not found`

## Configuration

| Variable                      | Description                               | Default |
|-------------------------------|-------------------------------------------|---------|
| `PORT`                        | HTTP listen port                          | `8080`  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/gRPC endpoint for metrics and traces | unset   |

Implementation defaults in `cmd/server/main.go`:

- cache size: **50,000** entries
- metric export interval: **5 seconds**
- meter / tracer name: **`go-simple`**
- custom counter: **`hello.request.count`**

## Run locally

```bash
cd services/go/simple
go mod download
go run ./cmd/server
```

With explicit environment variables:

```bash
cd services/go/simple
export PORT=8080
export OTEL_EXPORTER_OTLP_ENDPOINT=alloy:4317
go run ./cmd/server
```

## Docker

```bash
cd services/go/simple
docker build -t go-simple:latest .
docker run --rm -p 8080:8080 -e OTEL_EXPORTER_OTLP_ENDPOINT=alloy:4317 go-simple:latest
```

## Local quality checks

The module now has first-class lint, test, and coverage commands matching CI.

### Direct commands

```bash
cd services/go/simple
go vet ./...
golangci-lint run
go test ./... -race
go test ./... -race -coverprofile=coverage.out -covermode=atomic
go tool cover -func=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

### Makefile shortcuts

```bash
cd services/go/simple
make lint
make test
make coverage
```

## CI, reporting, and coverage

- **Lint / quality workflow**: `.github/workflows/go_quality.yml`
  - runs `go vet`, `golangci-lint run`, `go test -race`, `go build`, and `govulncheck`
  - uploads a hosted HTML quality report artifact: `quality-report-go-simple`
- **Coverage workflow**: `.github/workflows/go_coverage.yml`
  - runs `go test -race -coverprofile=coverage.out -covermode=atomic`
  - uploads `coverage.out` and `coverage.html`
  - enforces the current simple-module statement threshold of **30%**
- **Codecov flag**: `go-simple`
  - mapped in the repository root `codecov.yml` to `services/go/simple/`

Hosted report URLs on GitHub Pages:

```text
https://george-c-odes.github.io/Observability-Benchmarking/quality/go-simple/
```

## Testing notes

The unit tests cover:

- cache initialization
- endpoint success and not-found behavior
- port resolution from `PORT`
- boot logging
- `runWithContext` success path and boot failure paths
- OTLP provider initialization behavior

If your local Windows Go toolchain has filesystem-permission issues with the
managed toolchain cache, run the same commands in Docker instead. The CI
workflows run on Linux and remain the source of truth.

## References

- [Fiber documentation](https://docs.gofiber.io/)
- [OpenTelemetry Go](https://opentelemetry.io/docs/languages/go/)
- [Go modules](https://go.dev/ref/mod)
