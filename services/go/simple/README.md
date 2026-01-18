# Go Hello Service

## Overview
A high-performance REST service implementation written in Go using the Fiber web framework (v2.52.10). This service provides a simple endpoint for benchmarking under high concurrency scenarios with full observability integration.

## Purpose
- Demonstrates Go's excellent concurrency performance for REST services
- Serves as a baseline comparison against Java implementations (Spring, Quarkus)
- Provides lightweight, fast startup times with low memory footprint
- Exercises in-memory cache retrieval patterns

## Service Details

### Framework & Runtime
- **Language**: Go 1.25.5
- **Web Framework**: Fiber v2.52.10 (Express-inspired web framework)
- **Concurrency Model**: Goroutines (native Go concurrency)

### Endpoints

#### `GET /hello/virtual`
Returns a simple greeting message by retrieving a value from an in-memory cache.

**Response**: `"Hello from GO REST {value}"`

**Status**: 
- `200 OK` - Successful response with cached value
- `404 Not Found` - Value not found in cache

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint for metrics and traces | Required |
| `PORT` | HTTP server port (hardcoded in main.go) | `8080` |

### Application Configuration
The service is configured through code in `cmd/server/main.go`:

- **Cache Size**: 50,000 entries (key-value pairs)
- **Metrics Export Interval**: 5 seconds
- **OTLP Protocol**: gRPC with insecure connection

## Observability Metrics

### Custom Metrics

#### `hello.request.count` (Counter)
- **Type**: Int64 Counter
- **Description**: Total number of requests handled
- **Instrumentation**: Incremented on each request to `/hello/virtual`
- **Usage**: Track request throughput and volume

### OpenTelemetry Integration

#### Metrics
- **Exporter**: OTLP gRPC
- **Provider**: OpenTelemetry SDK Metrics
- **Reader**: Periodic (5-second intervals)
- **Meter Name**: `go-hello-fiber`

#### Tracing
- **Exporter**: OTLP gRPC  
- **Provider**: OpenTelemetry SDK Trace
- **Tracer Name**: `go-hello-fiber`
- **Spans**: Each request creates a span named `hello-handler`
- **Batching**: Automatic span batching enabled

### Observability Stack Integration
- **Alloy**: Collects metrics and traces via OTLP gRPC
- **Tempo**: Stores distributed traces
- **Mimir**: Stores metrics time-series data
- **Grafana**: Visualizes all telemetry data

## Architecture

### In-Memory Cache
- **Implementation**: Go map (`map[int]int`)
- **Pre-population**: 50,000 entries initialized at startup
- **Pattern**: Simple key-value lookup (keys: 1-50000, values: same as keys)
- **Concurrency**: No explicit locking (read-only after initialization)

### Performance Characteristics
- **Startup Time**: Sub-second (compiled binary)
- **Memory Footprint**: Minimal (~10-20 MB base + cache)
- **Request Handling**: Non-blocking, goroutine-per-request model
- **Throughput**: ~120,000 RPS (preliminary results, not directly comparable yet)

## Building and Running

### Prerequisites
- Go 1.25.5 or later
- Docker (for containerized deployment)

### Local Development
```bash
cd services/go/hello
go mod download
go run cmd/server/main.go
```

### Docker Build
```bash
cd services/go/hello
docker build -t go-hello:latest .
```

### Docker Run
```bash
docker run -p 8080:8080 \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=alloy:4317 \
  go-hello:latest
```

### Docker Compose
The service is included in the main compose stack but currently not fully integrated:
```bash
# From repository root
docker compose --project-directory compose --profile=OBS --profile=SERVICES up -d
```

## Testing

### Manual Testing
```bash
# Basic endpoint test
curl http://localhost:8080/hello/virtual

# Expected response
Hello from GO REST value-1
```

### Load Testing
Use the included wrk2 load generator:
```bash
# From repository root
docker compose --project-directory compose --profile=RAIN_FIRE up -d
```

## Known Limitations & Status

⚠️ **Work in Progress (WIP)**
- Full observability setup is not yet complete compared to Java services
- Missing comprehensive logging integration with Loki
- Profile integration with Pyroscope not yet implemented
- Performance comparison fairness very close to Java services

## Future Enhancements
- [ ] Complete Loki logging integration
- [ ] Add Pyroscope profiling support
- [ ] Implement additional endpoints (virtual, reactive modes for comparison)
- [ ] Add health check endpoints
- [ ] Implement structured logging
- [ ] Add graceful shutdown handling
- [ ] Configuration via environment variables instead of hardcoding

## Dependencies

### Direct Dependencies (go.mod)
- `github.com/gofiber/fiber/v2` - Web framework
- `go.opentelemetry.io/otel` - OpenTelemetry API
- `go.opentelemetry.io/otel/sdk/trace` - Trace SDK
- `go.opentelemetry.io/otel/sdk/metric` - Metrics SDK
- `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc` - Trace exporter
- `go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc` - Metrics exporter
- `google.golang.org/grpc` - gRPC support

## Contributing
When modifying this service:
1. Ensure OTLP endpoint configuration remains environment-based
2. Maintain consistency with metrics naming convention
3. Keep the cache initialization pattern for fair benchmarking
4. Document any new configuration options
5. Update this README with changes

## References
- [Fiber Documentation](https://docs.gofiber.io/)
- [OpenTelemetry Go](https://opentelemetry.io/docs/languages/go/)
- [Go Modules](https://go.dev/ref/mod)
