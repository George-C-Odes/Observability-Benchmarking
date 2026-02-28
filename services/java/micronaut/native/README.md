# Micronaut Native Service

## Overview
A high-performance REST service implementation built with Micronaut 4.10.16 compiled to a **GraalVM native executable**. This service shares the exact same source code as the JVM module (via `build-helper-maven-plugin`) and supports the same three concurrency models — platform threads, virtual threads, and reactive (Reactor) — in a single deployment. The native build trades JIT-level peak throughput for near-instant startup, lower memory usage, and a smaller container image.

## Purpose
- Benchmark Micronaut's native image performance across platform threads, virtual threads, and reactive programming models
- Compare native vs JVM execution using identical source code and endpoint logic
- Achieve sub-second startup and reduced memory footprint for serverless / high-density deployment scenarios
- Provide full observability (traces, metrics, logs) in a native binary via the embedded OpenTelemetry SDK

## Service Details

### Framework & Runtime
- **Framework**: Micronaut 4.10.16
- **Compiler**: GraalVM Native Image 25.0.2 (Enterprise — G1 GC)
- **Base Java**: 25.0.2
- **GC**: G1 Garbage Collector (Enterprise only)
- **Thread Models**: Platform, Virtual, and Reactive (all in one deployment)

### Source Code
This module contains **no `src/` directory**. Sources, resources, and tests are pulled from the JVM module at build time:

```xml
<!-- build-helper-maven-plugin -->
<source>../jvm/src/main/java</source>
<resource><directory>../jvm/src/main/resources</directory></resource>
<testSource>../jvm/src/test/java</testSource>
```

See [`../jvm/README.md`](../jvm/README.md) for the full architecture, source layout, and code walkthrough.

### Endpoints
Identical to the JVM module:

| Endpoint                        | Mode                      | Annotation               |
|---------------------------------|---------------------------|--------------------------|
| `GET /hello/platform`           | Platform threads          | `@ExecuteOn("platform")` |
| `GET /hello/virtual`            | Virtual threads           | `@ExecuteOn("virtual")`  |
| `GET /hello/virtual-event-loop` | Event-loop (experimental) | `@NonBlocking`           |
| `GET /hello/reactive`           | Reactive (`Mono`)         | `@NonBlocking`           |

**Query Parameters** (all endpoints):

| Parameter | Type    | Default | Description                           |
|-----------|---------|---------|---------------------------------------|
| `sleep`   | int     | `0`     | Sleep duration in **seconds**         |
| `log`     | boolean | `false` | Logs the current thread name and type |

**Responses** follow the same pattern:
```
Hello from Micronaut {mode} REST value-1
```

## Configuration

### Build-Time Configuration

#### Native Image Build Arguments
```bash
# Core flags
--no-fallback
-march=native
-O2
--gc=G1                                    # Enterprise only

# Memory
-R:+AlwaysPreTouch
-R:MaxGCPauseMillis=200
-R:MaxDirectMemorySize=32M
-R:MaxHeapSize=640M
-R:MinHeapSize=64M

# Debugging & profiling
-H:+PreserveFramePointer
-H:-DeleteLocalSymbols
-H:-StripDebugInfo
-H:GenerateDebugInfo=1
-H:+ReportExceptionStackTraces

# Monitoring
--enable-monitoring=heapdump,jfr

# Resources
-H:IncludeResources=logback.xml|application.yml

# Initialisation
--initialize-at-run-time=io.netty
--initialize-at-run-time=io.opentelemetry.instrumentation.logback
--initialize-at-run-time=reactor.netty

# Access
--enable-native-access=ALL-UNNAMED
```

### Runtime Configuration

#### Environment Variables (via Docker Compose)

| Variable                                           | Description                      | Default             |
|----------------------------------------------------|----------------------------------|---------------------|
| `CACHE_SIZE`                                       | Number of Caffeine cache entries | `50000`             |
| `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER` | Loom carrier property            | `false` (native)    |
| `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_NUM_THREADS`  | Netty event-loop thread count    | CPU limit           |
| `MICRONAUT_EXECUTORS_PLATFORM_NTHREADS`            | Platform thread pool size        | CPU limit           |
| `MICRONAUT_SERVER_THREAD_SELECTION`                | Thread selection strategy        | `MANUAL`            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                      | OpenTelemetry collector endpoint | `http://alloy:4317` |
| `OTEL_SERVICE_NAME`                                | Service name for telemetry       | `micronaut-native`  |

> **Loom carrier is disabled in native.** Native images cannot use `--add-opens` to access VirtualThread internals, so the experimental `loom-carrier` property is forced to `false`.

#### Native Image Runtime Options (Command Line)
```bash
-Xms64M -Xmx640M
-XX:ActiveProcessorCount=2
-XX:MaxGCPauseMillis=200          # Enterprise
-XX:MaxDirectMemorySize=32M       # Enterprise
-XX:+ExitOnOutOfMemoryError
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/error
```

### Application Configuration
Same `application.yml` as the JVM module. The native Dockerfile explicitly copies it into the runtime image and sets `MICRONAUT_CONFIG_FILES=/native/application.yml` so the executable can locate it.

## Observability

### OpenTelemetry Integration (embedded SDK)

The native binary embeds the same OpenTelemetry SDK wiring as the JVM module:

| Signal  | Mechanism                                          | Destination   |
|---------|----------------------------------------------------|---------------|
| Traces  | `micronaut-tracing-opentelemetry-http` (auto HTTP) | Alloy → Tempo |
| Metrics | Micrometer → `OpenTelemetryMeterRegistry` bridge   | Alloy → Mimir |
| Logs    | Logback OTel appender                              | Alloy → Loki  |

All three signals export via **OTLP gRPC**.

### Custom Application Metrics

#### `hello.request.count` (Counter)
Same as JVM module — tracks request count per endpoint.

**Tags**: `endpoint` = `/hello/platform` | `/hello/virtual` | `/hello/virtual-event-loop` | `/hello/reactive`

### Standard Metrics
- HTTP server request metrics
- JVM memory and GC metrics (adapted for native — G1 available in Enterprise)
- Process memory (RSS, VSS) and thread metrics (via `micrometer-jvm-extras`)

### Profiling Options
- **JFR (Java Flight Recorder)**: Supported in Enterprise GraalVM (`--enable-monitoring=jfr`)
- **eBPF Profiling**: Supported via Alloy/Pyroscope eBPF collector
- **Pyroscope Java Agent**: Not available (JVM agent only)

## Native Compilation Details

### Reflect Config
A hand-maintained `reflect-config.json` lives in the JVM module at:
```
src/main/resources/META-INF/native-image/io.github.georgecodes/micronaut-native/reflect-config.json
```

Micronaut's compile-time DI minimises the amount of reflection needed, but some OTel SDK and Netty classes still require explicit entries.

### Shade Plugin
The native module uses `maven-shade-plugin` to produce a single fat JAR before `native-image` compilation. Key behaviours:
- Merges `META-INF/services/*` entries (via `ServicesResourceTransformer`)
- Sets main class via `ManifestResourceTransformer`
- Excludes overlapping metadata (Netty, OTel, Spring config)

### Build Pipeline (Dockerfile)
```
┌──────────────────────────────────────────────────────────┐
│  Stage 1: builder (GraalVM native-image:25.0.2-ol9)     │
│  ├── Copy pom.xml + mvnw + checkstyle                   │
│  ├── mvn dependency:go-offline                           │
│  ├── Copy JVM module sources (shared)                    │
│  └── mvn package -Dnative → binary: micronaut-native     │
├──────────────────────────────────────────────────────────┤
│  Stage 2: runner (distroless/cc-debian13:nonroot)        │
│  ├── Copy application.yml                                │
│  ├── Copy native binary                                  │
│  └── ENTRYPOINT ["./micronaut-native"]                   │
└──────────────────────────────────────────────────────────┘
```

## Performance Characteristics

### Benchmark Results (2 vCPU limit, 28/02/2026)

| Mode     | RPS    | vs JVM  |
|----------|--------|---------|
| Platform | 16,000 | −47 %   |
| Virtual  | 15,000 | −59 %   |
| Reactive | 14,000 | −55 %   |

### Native Compilation Benefits
- **Fast Startup**: Sub-second (vs ~2–3 s for JVM)
- **Low Memory**: ~180 MB peak (vs ~431 MB for JVM)
- **Small Image**: ~348 MB container image
- **No JIT Warmup**: Instant peak performance (though peak is lower than JVM's JIT-optimised steady state)

### Native Compilation Trade-offs
- **Reduced Throughput**: JVM's JIT compiler produces better hot-path code over time
- **Build Time**: 5–10 minutes per native image
- **Build Memory**: Requires 10 GB+ RAM
- **Limited Reflection**: Requires explicit `reflect-config.json`
- **No Java Agent**: OTEL Java agent and Pyroscope agent not available
- **No Loom Carrier**: `--add-opens` not supported in native → `loom-carrier=false`

### Resource Usage
- **Heap Memory**: 640 MB (configurable)
- **Off-Heap**: 32 MB max
- **Peak Memory (observed)**: ~180 MB
- **Container Image Size**: ~348 MB
- **Startup Time**: <1 second

## Building and Running

### Prerequisites
- GraalVM Native Image 25.0.2+ (Enterprise recommended for G1 GC)
- Maven 3.9+ (bundled via `mvnw`)
- Docker (for containerised build)
- 16 GB+ RAM (for native compilation)

### Docker Build (Recommended)
```bash
cd services/java
docker build -f micronaut/native/Dockerfile -t micronaut-native:latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up micronaut-native -d
```

### Local Native Build
```bash
cd services/java/micronaut/native
./mvnw package -Dnative \
  -Dmicronaut.version=4.10.16 \
  -Dmaven.compiler.release=25
```

### Running the Binary
```bash
./target/micronaut-native \
  -Xms64M -Xmx640M \
  -XX:MaxGCPauseMillis=200
```

## Testing

### Health Checks
```bash
curl http://localhost:8093/health
```

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8093/hello/platform"

# Virtual threads
curl "http://localhost:8093/hello/virtual"

# Reactive
curl "http://localhost:8093/hello/reactive"

# With logging
curl "http://localhost:8093/hello/virtual?log=true"
```

### Startup Time Verification
```bash
docker logs micronaut-native 2>&1 | grep -i "started"
# Expected: sub-second startup
```

## Monitoring in Grafana

### Key Queries
```promql
# RPS by endpoint
rate(hello_request_count_total{service_name="micronaut-native"}[1m])

# Memory (RSS)
process_memory_rss_bytes{service_name="micronaut-native"}

# Heap usage
jvm_memory_used_bytes{service_name="micronaut-native", area="heap"}
```

## GraalVM Editions

| Feature     | Enterprise         | Community                  |
|-------------|--------------------|----------------------------|
| G1 GC       | ✅ Yes              | ❌ No (serial/epsilon only) |
| Performance | ~10 % better       | Baseline                   |
| JFR         | ✅ Yes              | ❌ No                       |
| License     | Oracle License     | GPL v2 + CPE               |

**Recommendation**: Use Enterprise for production benchmarks. This repository defaults to the Oracle Enterprise image.

## Known Issues
- `loom-carrier` is always `false` in native (JVM-only feature)
- Throughput is lower than JVM due to absence of JIT optimisation
- Some OTel SDK classes require `--initialize-at-run-time` to avoid build failures
- Shade plugin produces overlap warnings for Netty/OTel metadata — these are harmless and filtered

## Contributing
When modifying this service:
1. **Do not add sources here** — all code lives in `../jvm/src/` and is shared via `build-helper-maven-plugin`
2. Test native compilation locally (requires significant resources)
3. If new dependencies use reflection, update `reflect-config.json` in the JVM module's `META-INF/native-image/` directory
4. Update native build args in `pom.xml` if initialisation behaviour changes
5. Keep this README synchronised with the JVM README where applicable

## References
- [Micronaut GraalVM Guide](https://docs.micronaut.io/latest/guide/#graal)
- [GraalVM Native Image](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Native Image Build Configuration](https://www.graalvm.org/latest/reference-manual/native-image/overview/BuildConfiguration/)
- [Micronaut Tracing (OpenTelemetry)](https://micronaut-projects.github.io/micronaut-tracing/latest/guide/#openTelemetry)
- [Micronaut Micrometer](https://micronaut-projects.github.io/micronaut-micrometer/latest/guide/)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)

