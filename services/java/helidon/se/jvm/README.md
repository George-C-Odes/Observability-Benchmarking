# Helidon SE JVM Service

## Overview
A high-performance REST service implementation built with Helidon 4.3.4 (SE/Níma) running on the Java Virtual Machine (JVM 25). Helidon 4 is virtual-thread–first and dropped the reactive programming model, making it ideal for benchmarking virtual thread performance with minimal framework overhead.

## Purpose
- Benchmark Helidon 4 SE performance with virtual threads (the only thread model in Helidon 4)
- Demonstrate Helidon's minimal, functional routing with native virtual thread support
- Provide comprehensive observability with metrics, traces, logs via OTLP/gRPC
- Exercise high-concurrency cache retrieval patterns

## Service Details

### Framework & Runtime
- **Framework**: Helidon 4.3.4 SE (Níma)
- **Java Version**: Eclipse Temurin 25
- **JVM GC**: G1 Garbage Collector
- **Thread Model**: Virtual threads only (Helidon 4 default — every request runs on a virtual thread)

### Endpoints

#### `GET /hello/virtual`
Handles requests using Java virtual threads. In Helidon 4, all requests run on virtual threads by default. Routes are auto-registered for every `HelloMode` variant (OCP).

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Helidon SE virtual REST {value}"`

#### `GET /observe/health`
Helidon built-in health check endpoint (configured via `ObservabilityFeatureFactory`).

**Response**: JSON with `UP` status

### Architecture (Clean Architecture / Hexagonal)

```
HelidonApplication       → Composition root (wires all layers)
web/                     → HelloRouting, HttpMetricsFilter (inbound HTTP adapters)
application/             → HelloService (use-case logic)
application/port/        → CachePort, MetricsPort, SleepPort, HelloMode, TimeUnit (port interfaces & domain enums)
infra/                   → ObservabilityFeatureFactory (health-check feature factory)
infra/cache/             → CaffeineCacheAdapter
infra/metrics/           → MicrometerMetricsAdapter, OtelConfig, JvmExtrasMetricsConfiguration
infra/time/              → ThreadSleepAdapter
```

Dependencies point inward: `web → application ← infra`. The application layer has zero imports from framework or infrastructure code. All cross-layer communication uses port interfaces (DIP).

### Observability

**Approach**: OTel SDK Autoconfigure + OTLP/gRPC exporter

- **Traces**: Helidon WebServer observe tracing → OTel SDK → OTLP/gRPC → Alloy
- **Metrics**: Micrometer → OTel MeterProvider bridge → OTLP/gRPC → Alloy
  - `hello.request.count` — per-endpoint counter (via `MicrometerMetricsAdapter`)
  - `http.server.requests` — per-request timer (via `HttpMetricsFilter`, consistent with Spring/Quarkus/Micronaut)
  - JVM extras — process memory & thread metrics (via `JvmExtrasMetricsConfiguration`)
- **Logs**: Logback → OTel LogRecord appender → OTLP/gRPC → Alloy
- **Signal correlation**: Trace/span IDs are automatically correlated across logs via the OTel Logback appender

All three signal pipelines share the same SDK instance, configured via `OTEL_*` environment variables.

### Throughput Optimisations

The service is tuned for maximum throughput on constrained hardware (2 vCPU, 96 MB heap):

- **Cache hit on every request**: Every request calls `helloService.hello()` which reads the Caffeine cache via `cachePort.getIfPresent("1")`. This is consistent with all other benchmark modules and simulates a realistic service lookup.
- **Pre-interned status codes**: HTTP status code strings (100–599) are pre-interned in `HttpMetricsFilter` to avoid `String.valueOf()` per request.
- **Metrics warm-up**: Micrometer counters are eagerly registered at startup for all known endpoint tags, eliminating first-request `computeIfAbsent` overhead.
- **G1 tuning**: `G1HeapRegionSize=1m` and `G1ReservePercent=20` for stable GC on a 96 MB micro-heap. `UseStringDeduplication` removed (no benefit for this workload).
- **Server tuning**: `max-concurrent-requests=512`, `idle-connection-timeout=PT15S` (optimised for 2 vCPU).

### Docker

**Image**: `helidon-se-jvm:4.3.4_latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.9.12-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

- Port mapping: `8094:8080`
- Multi-stage build: Maven shade → jlink (strips unused JDK modules) → distroless
- Service-specific Maven cache mount (`maven-m2-helidon-se-jvm-*`) avoids contention with native builds
- `pom.xml` is copied before `dependency:go-offline`; checkstyle files and sources are deferred to later layers for optimal cache utilisation

### Build Command

```powershell
docker buildx build `
  -f services/java/helidon/se/jvm/Dockerfile `
  -t helidon-se-jvm:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-jvm:4.3.4_latest `
  --load `
  services/java
```

### Key Design Decisions

1. **Virtual threads only**: Helidon 4 dropped reactive and is virtual-thread–first. No platform/reactive endpoints.
2. **Helidon SE (functional routing)**: No CDI/annotation overhead. Pure functional `HttpRouting.Builder`.
3. **Shared codebase for JVM and native**: The native module reuses JVM sources via `build-helper-maven-plugin`.
4. **OTel SDK autoconfigure**: Minimal custom wiring — all configuration driven by `OTEL_*` env vars.
5. **Micrometer bridge**: Metrics flow through Micrometer → OTel SDK → OTLP/gRPC for consistency with other services.
6. **JUL → SLF4J bridge**: Helidon uses JUL internally; bridged to Logback for consistent log formatting and OTel integration.
7. **Auto-registered routes (OCP)**: `HelloRouting.register()` iterates `HelloMode.values()` — adding a new mode variant requires no routing changes.
8. **`ObservabilityFeatureFactory` (SRP)**: Health-check and observe-feature setup is extracted from the composition root into a reusable factory in the `infra/` layer.
9. **`TimeUnit` enum owns conversion (OCP)**: Each `TimeUnit` constant implements `toMillis()` — adapters never need a switch/if for new units.
10. **Unified request flow**: Every request — regardless of `sleep` — calls `helloService.hello()` which increments the metric, optionally sleeps, and reads the Caffeine cache. This ensures a realistic workload consistent with all other benchmark modules.
