# Vert.x JVM Service

A fully reactive, high-throughput REST service implemented with **Eclipse Vert.x 5.0.8** on **Java 25**.

This module provides a `/hello/reactive` endpoint for benchmarking Vert.x's event-loop-based
non-blocking I/O model. All request handling runs on the Vert.x event loop — no blocking,
no virtual threads, no thread-per-request overhead.

## Endpoints

- `GET /hello/reactive`
- `GET /ready`

### Query params
- `sleep` (int, default `0`) – sleep duration in **seconds** (uses non-blocking `vertx.setTimer`)
- `log` (boolean, default `false`) – logs the current thread

### Responses
- `Hello from Vertx reactive REST value-1`

## Architecture

```
config/    → ServiceConfig (env-driven, Java record)
domain/    → HelloMode, HelloService (pure logic, no framework deps)
infra/     → CacheProvider, MetricsProvider (Caffeine, Micrometer)
web/       → HelloRoutes (Vert.x Router handlers)
```

Follows clean architecture / hexagonal principles:
- Domain layer is framework-agnostic
- Infrastructure adapters are injected via constructor
- Web layer is a thin routing adapter

## Configuration (env)
- `SERVICE_PORT` (default `8080`)
- `CACHE_SIZE` (default `50000`)
- `VERTX_EVENT_LOOP_SIZE` (default `0` → 2 × available processors)

## Docker

**Image**: `vertx-jvm:latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.9.12-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

- Multi-stage build: Maven package → jlink (strips unused JDK modules) → distroless
- The runtime image contains only the application JAR + a minimal custom JRE in `/opt/jre`
- OpenTelemetry Java agent for full batched observability (traces, metrics, logs) via gRPC

### Build Command

```powershell
docker buildx build `
  -f services/java/vertx/jvm/Dockerfile `
  -t vertx-jvm:latest `
  --build-arg VERTX_VERSION=5.0.8 `
  --build-arg BUILDKIT_BUILD_NAME=vertx-jvm:latest `
  --load `
  services/java
```

## Throughput Tuning

- **Event-loop threads**: Defaults to `2 × availableProcessors` (4 on 2-vCPU container)
- **Multiple HTTP server instances**: One per event-loop thread for optimal connection distribution
- **Native transport**: Enabled (`setPreferNativeTransport(true)`) for epoll on Linux
- **TCP tuning**: `TCP_NODELAY`, `TCP_FASTOPEN`, `TCP_QUICKACK`, `SO_REUSEPORT`
- **No compression**: Short JSON payloads don't benefit; saves CPU
- **Netty leak detection disabled**: Zero overhead in production
- **Accept backlog**: 8192 for burst handling

## Metrics
Defines a Micrometer counter:
- `hello.request.count{endpoint="/hello/reactive"}`

Also binds `ProcessMemoryMetrics`, `ProcessThreadMetrics` (micrometer-jvm-extras),
and standard JVM metrics (GC, memory, threads, classloader, processor).

Export is handled by the OpenTelemetry Java agent in the benchmark stack.

## Benchmark Results (06/03/2026)

| Mode     | RPS | Peak Mem (MB) | Image Size (MB) |
|----------|-----|---------------|-----------------|
| Reactive | 26k | 336           | 220             |