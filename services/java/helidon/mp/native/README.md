# Helidon MP Native Image Service

## Overview
A GraalVM native-image build of the Helidon 4.3.4 MicroProfile benchmarking service. Produces an ahead-of-time compiled binary with near-instant startup and a minimal memory footprint, running on a distroless container with no JVM.

This module **shares the Java sources** from [`helidon-mp-jvm`](../jvm/README.md) via `build-helper-maven-plugin` and overlays native-specific classes: a custom `Bootstrap` entrypoint, GraalVM substitutions for Weld threading, and a `WeldProxyBuildTimeInitFeature` for proxy class registration.

## Purpose
- Benchmark Helidon 4 MP native-image performance against the JVM variant
- Measure startup time, peak throughput, and memory consumption of AOT-compiled CDI + JAX-RS
- Validate that CDI-based clean architecture compiles cleanly under GraalVM `native-image`
- Provide identical observability (traces, metrics, logs via OTLP/gRPC) for fair comparison

## Service Details

### Framework & Runtime
- **Framework**: Helidon 4.3.4 MP (CDI + JAX-RS)
- **CDI**: Weld (Jakarta CDI 4.0)
- **Compiler**: GraalVM `native-image` 25.0.2 (`-O2`, `-march=native`)
- **GC**: G1 Garbage Collector (`--gc=G1`)
- **Thread Model**: Virtual threads only (Helidon 4 default)

### Endpoints

Identical to the JVM variant.

#### `GET /hello/virtual`
Handles requests using Java virtual threads.

**Query Parameters**:
- `sleep` (int, default: 0) — Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) — Enable detailed thread logging

**Response**: `"Hello from Helidon MP virtual REST {value}"`

#### `GET /health/live`
MicroProfile Health liveness check (via `LivenessHealthCheck`).

**Response**: JSON with `UP` status

### Architecture (Clean Architecture / Hexagonal)

Shared codebase from the JVM module, plus native-specific classes:

```
web/                     → HelloApplication, HelloResource, HttpMetricsFilter, LivenessHealthCheck (JAX-RS + CDI)
application/             → HelloService (use-case logic, @ApplicationScoped)
application/port/        → CachePort, MetricsPort, SleepPort, HelloMode, TimeUnit (port interfaces & domain enums)
infra/                   → StartupListener, JulBridgeStartupListener (CDI lifecycle observers)
infra/cache/             → CaffeineCacheAdapter (@ApplicationScoped)
infra/metrics/           → MicrometerMetricsAdapter, OtelConfig, OtelSdkInitExtension, JvmExtrasMetricsConfiguration
infra/time/              → ThreadSleepAdapter (@ApplicationScoped)
── native-only (overlaid from helidon/mp/native/src/) ──
Bootstrap                → Native entrypoint (sets Weld system properties, invokes Helidon Main reflectively)
graalvm/                 → WeldProxyBuildTimeInitFeature, WeldExecutorSubstitution,
                           WeldEventPreloaderSubstitution, ReentrantLockSubstitution
```

Dependencies point inward: `web → application ← infra`. The application layer has zero imports from framework or infrastructure code (except CDI annotations).

### Observability

**Approach**: OTel SDK Autoconfigure + OTLP/gRPC exporter (identical pipeline to the JVM variant)

- **Traces**: Helidon MP tracing (OTel provider) → OTel SDK → OTLP/gRPC → Alloy
- **Metrics**: Micrometer → OTel MeterProvider bridge → OTLP/gRPC → Alloy
  - `hello.request.count` — per-endpoint counter (via `MicrometerMetricsAdapter`)
  - `http.server.requests` — per-request timer (via `HttpMetricsFilter`, consistent with Spring/Quarkus/Micronaut)
  - JVM extras — process memory & thread metrics (via `JvmExtrasMetricsConfiguration`)
- **Logs**: Logback → OTel LogRecord appender → OTLP/gRPC → Alloy (attached programmatically at runtime by `StartupListener`)
- **Signal correlation**: Trace/span IDs are automatically correlated across logs

**Native-mode Logback note**: The OTel Logback appender is **not** declared in `logback.xml` for native builds. Logback is initialized at build time (required by Weld/JBoss Logging), and including the OTel appender in XML would conflict with `--initialize-at-run-time=io.opentelemetry.instrumentation.logback`. Instead, `StartupListener.attachAppenderProgrammatically()` creates and attaches the appender at runtime.

### Throughput Optimisations

Same application-level optimisations as the JVM variant, plus native-image specific tuning:

- **Cache hit on every request**: Every request calls `helloService.hello()` which reads the Caffeine cache via `cachePort.getIfPresent("1")`, consistent with all other benchmark modules.
- **Pre-interned status codes**: HTTP status code strings (100–599) are pre-interned in `HttpMetricsFilter`.
- **Metrics warm-up**: Micrometer counters are eagerly registered at startup.
- **AOT compilation**: `-O2` optimisation level.
- **G1 GC**: `--gc=G1` with `MaxGCPauseMillis=200`, pre-touched heap (`AlwaysPreTouch`).
- **Monitoring**: JFR and heap-dump support enabled (`--enable-monitoring=heapdump,jfr`).

### Native Image Build Complexity

Building Helidon MP as a native image is significantly more complex than SE due to CDI (Weld) running at build time. Key challenges and solutions:

| Challenge                                                        | Solution                                                                   |
|------------------------------------------------------------------|----------------------------------------------------------------------------|
| Weld ForkJoinPool deadlocks with GraalVM analysis                | `--parallelism=1`, `-H:NumberOfThreads=1`, fixed Weld thread pool          |
| Weld proxy classes need build-time init                          | `WeldProxyBuildTimeInitFeature` auto-discovers and registers proxies       |
| `ReentrantLock.exclusiveOwnerThread` captures build-time threads | `ReentrantLockSubstitution` nulls out the field via `@RecomputeFieldValue` |
| `ContainerLifecycleEventPreloader` NPEs in native                | Disabled via system property                                               |
| Weld `RegistrySingletonProvider` not instantiable                | `Bootstrap` sets system properties before CDI boot                         |
| OTel Logback appender conflicts with build-time init             | Programmatic attachment at runtime instead of XML declaration              |

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
| `--parallelism=1 -H:NumberOfThreads=1`                              | Single-threaded analysis to avoid Weld deadlock  |
| `-H:DeadlockWatchdogInterval=5`                                     | Detect stalls during build                       |
| `--enable-monitoring=heapdump,jfr`                                  | Runtime monitoring support                       |
| `--initialize-at-run-time=io.opentelemetry.instrumentation.logback` | Defer OTel logback init to runtime               |

### Docker

**Image**: `helidon-mp-native:4.3.4_latest`

| Stage   | Image                                                           |
|---------|-----------------------------------------------------------------|
| Build   | `container-registry.oracle.com/graalvm/native-image:25.0.2-ol9` |
| Runtime | `gcr.io/distroless/cc-debian13:nonroot`                         |

- Port mapping: `8097:8080`
- Multi-stage build: Maven shade → GraalVM `native-image` → distroless (no JVM in runtime image)
- Uses Maven Wrapper (`mvnw`) since GraalVM base image does not ship Maven
- Service-specific Maven cache mount (`maven-m2-helidon-mp-native-*`) avoids contention with other builds
- `pom.xml` is copied before `dependency:go-offline`; checkstyle files and sources are deferred to later layers for optimal cache utilisation
- `NATIVE_IMAGE_INIT_BUILD_TIME`, `NATIVE_IMAGE_INIT_RUN_TIME`, and `NATIVE_IMAGE_EXTRA_ARGS` build args allow tuning without Dockerfile changes
- Debug step inspects Weld bootstrap class signatures for native-image troubleshooting

### Build Command

```powershell
docker buildx build `
  -f services/java/helidon/mp/native/Dockerfile `
  -t helidon-mp-native:4.3.4_latest `
  --build-arg HELIDON_VERSION=4.3.4 `
  --build-arg BUILDKIT_BUILD_NAME=helidon-mp-native:4.3.4_latest `
  --load `
  services/java
```

### Runtime Configuration

Weld system properties are passed as entrypoint arguments (distroless has no shell):

```dockerfile
ENTRYPOINT ["./helidon-mp-native",
  "-Dorg.jboss.weld.bootstrap.api.helpers.SingletonProvider=org.jboss.weld.bootstrap.api.helpers.Singletons",
  "-Dorg.jboss.weld.bootstrap.events.ContainerLifecycleEvents.PRELOAD_PROCESS_INJECTION_TARGET=false"]
```

Runtime GC/memory defaults are baked into the native binary but can be overridden via docker-compose `command`.

### Key Design Decisions

1. **Shared codebase**: The native module overlays JVM sources. Changes in `helidon/mp/jvm/src/` are automatically picked up by both builds.
2. **Custom `Bootstrap` entrypoint**: Sets Weld system properties programmatically (native binaries don't support `-D` from command line), then invokes `io.helidon.microprofile.cdi.Main` reflectively to avoid eager class init during GraalVM analysis.
3. **Separate `pom.xml`**: Required for the `native-maven-plugin` configuration, GraalVM substitutions, and build-time/run-time initialization directives.
4. **Maven Wrapper**: Uses `mvnw` since the GraalVM base image does not ship Maven.
5. **Separate `logback.xml`**: Native builds use a logback config without the OTel appender (to avoid build-time init conflicts). The appender is added programmatically at runtime.
6. **Distroless runtime**: `cc-debian13` provides only the C/C++ runtime libraries needed by the native binary.
7. **All design decisions from [helidon-mp-jvm](../jvm/README.md)** apply equally (virtual threads, OTel autoconfigure, Micrometer bridge, JUL bridge, OCP TimeUnit, unified request flow, metrics warm-up).

