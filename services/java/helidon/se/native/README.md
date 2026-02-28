# Helidon SE Native Image Service

## Overview
A GraalVM native-image build of the Helidon 4.3.4 SE benchmarking service. Produces an ahead-of-time compiled binary with near-instant startup and a minimal memory footprint, running on a distroless container with no JVM.

This module **shares the exact same Java sources** as [`helidon-se-jvm`](../jvm/README.md) via `build-helper-maven-plugin`. The only differences are the build toolchain (GraalVM `native-image` instead of `javac` + jlink) and the runtime container.

## Purpose
- Benchmark Helidon 4 SE native-image performance against the JVM variant
- Measure startup time, peak throughput, and memory consumption of AOT-compiled Java
- Validate that the shared codebase (clean architecture, ports & adapters) compiles cleanly under GraalVM `native-image`
- Provide identical observability (traces, metrics, logs via OTLP/gRPC) for fair comparison

## Service Details

### Framework & Runtime
- **Framework**: Helidon 4.3.4 SE (Níma)
- **Compiler**: GraalVM `native-image` 25.0.2 (`-O2`, `-march=native`)
- **GC**: G1 Garbage Collector (`--gc=G1`)
- **Thread Model**: Virtual threads only (Helidon 4 default)

### Endpoints

Identical to the JVM variant — routes are auto-registered for every `HelloMode` variant (OCP).

#### `GET /hello/virtual`
Handles requests using Java virtual threads.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Helidon SE virtual REST {value}"`

#### `GET /observe/health`
Helidon built-in health check endpoint (configured via `ObservabilityFeatureFactory`).

**Response**: JSON with `UP` status

### Architecture (Clean Architecture / Hexagonal)

Identical codebase to the JVM module — sources are reused via `build-helper-maven-plugin`:

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

**Approach**: OTel SDK Autoconfigure + OTLP/gRPC exporter (identical pipeline to the JVM variant)

- **Traces**: Helidon WebServer observe tracing → OTel SDK → OTLP/gRPC → Alloy
- **Metrics**: Micrometer → OTel MeterProvider bridge → OTLP/gRPC → Alloy
  - `hello.request.count` — per-endpoint counter (via `MicrometerMetricsAdapter`)
  - `http.server.requests` — per-request timer (via `HttpMetricsFilter`, consistent with Spring/Quarkus/Micronaut)
  - JVM extras — process memory & thread metrics (via `JvmExtrasMetricsConfiguration`)
- **Logs**: Logback → OTel LogRecord appender → OTLP/gRPC → Alloy
- **Signal correlation**: Trace/span IDs are automatically correlated across logs via the OTel Logback appender

All three signal pipelines share the same SDK instance, configured via `OTEL_*` environment variables.

### Throughput Optimisations

Same application-level optimisations as the JVM variant, plus native-image specific tuning:

- **Cache hit on every request**: Every request calls `helloService.hello()` which reads the Caffeine cache via `cachePort.getIfPresent("1")`, consistent with all other benchmark modules.
- **Pre-interned status codes**: HTTP status code strings (100–599) are pre-interned in `HttpMetricsFilter`.
- **Metrics warm-up**: Micrometer counters are eagerly registered at startup for all known endpoint tags.
- **AOT compilation**: `-O2` optimisation level.
- **G1 GC**: `--gc=G1` with `MaxGCPauseMillis=200`, pre-touched heap (`AlwaysPreTouch`).
- **Monitoring**: JFR and heap-dump support enabled (`--enable-monitoring=heapdump,jfr`).

### Native Image Build Args

Key `native-image` flags configured in `pom.xml`:

| Flag                                                                | Purpose                                          |
|---------------------------------------------------------------------|--------------------------------------------------|
| `-O2`                                                               | Optimise for throughput                          |
| `-march=native`                                                     | Best performance                                 |
| `--gc=G1`                                                           | G1 garbage collector                             |
| `--no-fallback`                                                     | Fail the build if fallback image would be needed |
| `-R:MinHeapSize=64M -R:MaxHeapSize=640M`                            | Sane heap allocations                            |
| `-R:MaxGCPauseMillis=200`                                           | GC pause target                                  |
| `-R:MaxDirectMemorySize=32M`                                        | Off-heap memory limit                            |
| `-R:+AlwaysPreTouch`                                                | Pre-touch heap pages at startup                  |
| `-H:-StripDebugInfo`                                                | Richer frames for profiler                       |
| `-H:+ReportExceptionStackTraces`                                    | Include stack traces in error reports            |
| `--enable-monitoring=heapdump,jfr`                                  | Runtime monitoring support                       |
| `--initialize-at-run-time=io.opentelemetry.instrumentation.logback` | Defer OTel logback init to runtime               |

### Docker

**Image**: `helidon-se-native:4.3.4_latest`

| Stage   | Image                                                           |
|---------|-----------------------------------------------------------------|
| Build   | `container-registry.oracle.com/graalvm/native-image:25.0.2-ol9` |
| Runtime | `gcr.io/distroless/cc-debian13:nonroot`                         |

- Port mapping: `8095:8080`
- Multi-stage build: Maven shade → GraalVM `native-image` → distroless (no JVM in runtime image)
- Uses Maven Wrapper (`mvnw`) with `.gitattributes` enforcing Unix line endings
- Service-specific Maven cache mount (`maven-m2-helidon-se-native-*`) avoids contention with JVM builds
- `pom.xml` is copied before `dependency:go-offline`; checkstyle files and sources are deferred to later layers for optimal cache utilisation
- Reflect-config for Logback, Helidon service descriptors, and OTel appender is provided via `META-INF/native-image/`

### Build Command

```powershell
docker buildx build `
  -f services/java/helidon/se/native/Dockerfile `
  -t helidon-se-native:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-se-native:4.3.4_latest `
  --load `
  services/java
```

### Runtime Configuration

Runtime GC/memory defaults are baked into the native binary but can be overridden via docker-compose `command`:

```yaml
command:
  - "-Xms96M"
  - "-Xmx96M"
  - "-XX:ActiveProcessorCount=2"
  - "-XX:MaxGCPauseMillis=200"
  - "-XX:MaxDirectMemorySize=32M"
  - "-XX:+ExitOnOutOfMemoryError"
  - "-XX:+HeapDumpOnOutOfMemoryError"
  - "-XX:HeapDumpPath=/var/log/error"
```

### Key Design Decisions

1. **Shared codebase**: The native module has no Java sources of its own — `build-helper-maven-plugin` adds `../jvm/src/main/java` and `../jvm/src/main/resources` as source/resource directories. A single change in the JVM module is automatically picked up by both builds.
2. **Separate `pom.xml`**: Required for the `native-maven-plugin` configuration and `native` Maven profile. Dependencies are duplicated (a shared parent POM is a future consideration).
3. **Maven Wrapper**: Uses `mvnw` instead of a pre-installed `mvn` — the GraalVM base image does not ship Maven.
4. **Distroless runtime**: `cc-debian13` provides only the C/C++ runtime libraries needed by the native binary. No shell, no package manager, no JVM.
5. **Reflect-config**: GraalVM native-image requires explicit reflection metadata for Logback, Helidon service descriptors, and the OTel logback appender. This is provided via `META-INF/native-image/io.github.georgecodes/helidon-native/reflect-config.json` in the shared resources.
6. **All design decisions from [helidon-se-jvm](../jvm/README.md)** apply equally (virtual threads, OTel autoconfigure, Micrometer bridge, JUL bridge, OCP routing, SRP factories, TimeUnit conversion, unified request flow, metrics warm-up).

