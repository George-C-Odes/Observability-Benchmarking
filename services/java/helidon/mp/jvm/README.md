# Helidon MP JVM Service

## Overview
A high-performance REST service implementation built with Helidon 4.3.4 MicroProfile running on the Java Virtual Machine (JVM 25). Helidon 4 MP uses CDI (Weld) for dependency injection, JAX-RS (Jersey) for routing, and virtual threads by default for every request handler.

## Purpose
- Benchmark Helidon 4 MP performance with virtual threads against the SE variant and other frameworks
- Demonstrate CDI-based clean architecture with ports & adapters on Helidon MP
- Provide comprehensive observability with metrics, traces, logs via OTLP/gRPC
- Exercise high-concurrency cache retrieval patterns with MicroProfile Config injection

## Service Details

### Framework & Runtime
- **Framework**: Helidon 4.3.4 MP (CDI + JAX-RS)
- **CDI**: Weld (Jakarta CDI 4.0)
- **JAX-RS**: Jersey (Jakarta REST 3.1)
- **Java Version**: Eclipse Temurin 25
- **JVM GC**: G1 Garbage Collector
- **Thread Model**: Virtual threads only (Helidon 4 default — every request runs on a virtual thread)

### Endpoints

#### `GET /hello/virtual`
Handles requests using Java virtual threads. In Helidon MP 4, all requests run on virtual threads by default.

**Query Parameters**:
- `sleep` (int, default: 0) — Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) — Enable detailed thread logging

**Response**: `"Hello from Helidon MP virtual REST {value}"`

#### `GET /health/live`
MicroProfile Health liveness check (via `LivenessHealthCheck`).

**Response**: JSON with `UP` status

### Architecture (Clean Architecture / Hexagonal)

```
web/                     → HelloApplication, HelloResource, HttpMetricsFilter, LivenessHealthCheck (JAX-RS + CDI)
application/             → HelloService (use-case logic, @ApplicationScoped)
application/port/        → CachePort, MetricsPort, SleepPort, HelloMode, TimeUnit (port interfaces & domain enums)
infra/                   → StartupListener, JulBridgeStartupListener (CDI lifecycle observers)
infra/cache/             → CaffeineCacheAdapter (@ApplicationScoped)
infra/metrics/           → MicrometerMetricsAdapter, OtelConfig, OtelSdkInitExtension, JvmExtrasMetricsConfiguration
infra/time/              → ThreadSleepAdapter (@ApplicationScoped)
```

Dependencies point inward: `web → application ← infra`. The application layer has zero imports from framework or infrastructure code (except the CDI `@Inject` / `@ApplicationScoped` annotations). All cross-layer communication uses port interfaces (DIP).

### Observability

**Approach**: OTel SDK Autoconfigure + OTLP/gRPC exporter

- **Traces**: Helidon MP tracing (OTel provider) → OTel SDK → OTLP/gRPC → Alloy
- **Metrics**: Micrometer → OTel MeterProvider bridge → OTLP/gRPC → Alloy
  - `hello.request.count` — per-endpoint counter (via `MicrometerMetricsAdapter`)
  - `http.server.requests` — per-request timer (via `HttpMetricsFilter`, consistent with Spring/Quarkus/Micronaut)
  - JVM extras — process memory & thread metrics (via `JvmExtrasMetricsConfiguration`)
- **Logs**: Logback → OTel LogRecord appender → OTLP/gRPC → Alloy
- **Signal correlation**: Trace/span IDs are automatically correlated across logs via the OTel Logback appender

All three signal pipelines share the same SDK instance, configured via `OTEL_*` environment variables.

**OTel SDK early initialization**: The SDK is initialized in `OtelSdkInitExtension` (a CDI `Extension`) during Weld extension loading — the earliest possible point in the CDI lifecycle. This ensures `GlobalOpenTelemetry` is populated before Helidon's `TracingCdiExtension` resolves the tracer.

### Throughput Optimisations

The service is tuned for maximum throughput on constrained hardware (2 vCPU, 96 MB heap):

- **Cache hit on every request**: Every request calls `helloService.hello()` which reads the Caffeine cache via `cachePort.getIfPresent("1")`. This is consistent with all other benchmark modules and simulates a realistic service lookup.
- **Pre-interned status codes**: HTTP status code strings (100–599) are pre-interned in `HttpMetricsFilter` to avoid `String.valueOf()` per request.
- **Type-safe timer cache key**: `TimerKey` record replaces string concatenation for the timer cache key — no per-request String alloc.
- **Metrics warm-up**: Micrometer counters are eagerly registered at startup for all known endpoint tags via `MicrometerMetricsAdapter.warmUp()`, eliminating first-request `computeIfAbsent` overhead.
- **G1 tuning**: `G1HeapRegionSize=1m` and `G1ReservePercent=20` for stable GC on a 96 MB micro-heap. `UseStringDeduplication` removed (no benefit for this workload).
- **Server tuning**: `max-concurrent-requests=512`, `idle-connection-timeout=PT15S` (optimised for 2 vCPU).

### Docker

**Image**: `helidon-mp-jvm:4.3.4_latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.9.12-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

- Port mapping: `8096:8080`
- Multi-stage build: Maven shade → jlink (strips unused JDK modules, adds `java.net.http` for OTel OTLP HTTP sender) → distroless
- Service-specific Maven cache mount (`maven-m2-helidon-mp-jvm-*`) avoids contention with other builds
- `pom.xml` is copied before `dependency:go-offline`; checkstyle files and sources are deferred to later layers for optimal cache utilisation

### Build Command

```powershell
docker buildx build `
  -f services/java/helidon/mp/jvm/Dockerfile `
  -t helidon-mp-jvm:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-jvm:4.3.4_latest `
  --load `
  services/java
```

### Key Design Decisions

1. **Virtual threads only**: Helidon 4 MP is virtual-thread–first. No platform/reactive endpoints.
2. **Helidon MP (CDI + JAX-RS)**: Full MicroProfile stack — CDI for DI, JAX-RS for routing, MicroProfile Config for configuration, MicroProfile Health for health checks.
3. **Shared codebase for JVM and native**: The native module reuses JVM sources via `build-helper-maven-plugin` and overlays native-specific classes (Bootstrap, GraalVM substitutions).
4. **OTel SDK early init via CDI extension**: `OtelSdkInitExtension` initializes the SDK in its constructor (during `ServiceLoader` extension loading), before any CDI lifecycle events fire. This guarantees `GlobalOpenTelemetry` is set before Helidon's tracing extension.
5. **Micrometer bridge**: Metrics flow through Micrometer → OTel SDK → OTLP/gRPC for consistency with other services.
6. **JUL → SLF4J bridge**: Helidon/Weld use JUL internally; `JulBridgeStartupListener` bridges to Logback for consistent log formatting and OTel integration.
7. **`TimeUnit` enum owns conversion (OCP)**: Each `TimeUnit` constant implements `toMillis()` — adapters never need a switch/if for new units.
8. **Unified request flow**: Every request — regardless of `sleep` — calls `helloService.hello()` which increments the metric, optionally sleeps, and reads the Caffeine cache. This ensures a realistic workload consistent with all other benchmark modules.
9. **Metrics warm-up at CDI startup**: `StartupListener` injects `MicrometerMetricsAdapter` and calls `warmUp()` for all `HelloMode` values before first traffic.
10. **`JvmExtrasMetricsConfiguration` instance-based (DIP)**: Registry is injected, not accessed via static global — testable and scoped to CDI lifecycle.

