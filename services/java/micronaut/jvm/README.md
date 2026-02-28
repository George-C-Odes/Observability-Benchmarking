# Micronaut JVM Service

## Overview
A high-performance REST service implementation built with Micronaut 4.10.16 running on the Java Virtual Machine (JDK 25). This service supports three concurrency models — platform threads, virtual threads, and reactive (Reactor) — in a single deployment via endpoint routing, making it ideal for benchmarking different concurrency approaches with minimal configuration overhead.

## Purpose
- Benchmark Micronaut's compile-time DI/AOP performance across platform threads, virtual threads, and reactive programming models
- Demonstrate Micronaut's unified programming model serving all three thread modes from a single deployment
- Provide comprehensive observability with metrics, traces, and logs via the OpenTelemetry SDK (no Java agent required)
- Exercise high-concurrency cache-retrieval patterns identical to the other framework benchmarks

## Service Details

### Framework & Runtime
- **Framework**: Micronaut 4.10.16
- **Java Version**: Eclipse Temurin 25.0.2
- **HTTP Server**: Netty (Micronaut HTTP Server Netty)
- **JVM GC**: G1 Garbage Collector
- **Thread Models**: Platform, Virtual, and Reactive (all in one deployment)

### Architecture
The codebase follows a **hexagonal (ports-and-adapters)** layout:

```
io.github.georgecodes.benchmarking.micronaut
├── MicronautApplication.java          # Entry point
├── application/
│   ├── HelloService.java              # Use-case / application layer
│   └── port/
│       ├── CachePort.java             # Outbound port — cache lookup
│       ├── HelloMode.java             # Enum of concurrency modes
│       ├── MetricsPort.java           # Outbound port — metric recording
│       ├── SleepPort.java             # Outbound port — simulated latency
│       └── TimeUnit.java              # Time unit abstraction
├── infra/
│   ├── cache/
│   │   └── CaffeineCacheAdapter.java  # CachePort → Caffeine implementation
│   ├── metrics/
│   │   ├── JvmExtrasMetricsConfiguration.java  # Process memory/thread binders
│   │   ├── MicrometerMetricsAdapter.java        # MetricsPort → Micrometer
│   │   └── OtelConfig.java            # Micrometer→OTel bridge + Logback installer
│   └── time/
│       └── ThreadSleepAdapter.java    # SleepPort → Thread.sleep
└── web/
    └── HelloController.java           # REST endpoints (all four modes)
```

### Endpoints

All endpoints live under `/hello` and share the same query parameters.

#### `GET /hello/platform`
Handles requests on a **fixed-size platform thread pool** (`@ExecuteOn("platform")`).

**Response**: `"Hello from Micronaut platform REST value-1"`

#### `GET /hello/virtual`
Handles requests on **Java 21+ virtual threads** (`@ExecuteOn("virtual")`).

**Response**: `"Hello from Micronaut virtual REST value-1"`

#### `GET /hello/virtual-event-loop`
Experimental — runs on the Netty event loop when `loom-carrier` is enabled, so the event-loop thread is itself a virtual thread. Excluded from headline benchmarks.

**Response**: `"Hello from Micronaut virtual-event-loop REST value-1"`

#### `GET /hello/reactive`
Returns a **Reactor `Mono<String>`** processed on the Netty event loop (`@NonBlocking`).

**Response**: `"Hello from Micronaut reactive REST value-1"`

### Query Parameters (all endpoints)
| Parameter | Type    | Default | Description                               |
|-----------|---------|---------|-------------------------------------------|
| `sleep`   | int     | `0`     | Sleep duration in **seconds**             |
| `log`     | boolean | `false` | Logs the current thread name and type     |

## Configuration

### Application Configuration (`application.yml`)

#### Executors
```yaml
micronaut:
  executors:
    platform:
      type: FIXED
      nThreads: 4
      virtual: false
    virtual:
      type: THREAD_PER_TASK
      virtual: true
```

#### Netty Event Loops
```yaml
micronaut:
  netty:
    event-loops:
      default:
        loom-carrier: ${MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER:false}
        num-threads: 2
        transport: [io_uring, epoll, kqueue, nio]
  server:
    netty:
      access-logger:
        enabled: false
    port: 8080
    thread-selection: MANUAL
```

> **Loom carrier**: when `loom-carrier=true` Netty's event-loop threads are virtual threads, which experimentally boosts virtual-thread performance by ~10 %.

#### Metrics & Telemetry
```yaml
micrometer:
  enabled: true
  export:
    otlp:
      enabled: false        # OTLP export handled by OTel SDK, not Micrometer registry
otel:
  exporter:
    otlp:
      protocol: grpc
  logs:
    exporter: otlp
  metrics:
    exporter: otlp
  traces:
    exporter: otlp
```

### Environment Variables (via Docker Compose)

| Variable                                           | Description                          | Default             |
|----------------------------------------------------|--------------------------------------|---------------------|
| `JAVA_TOOL_OPTIONS`                                | JVM options (GC, memory, etc.)       | Set by compose      |
| `CACHE_SIZE`                                       | Number of Caffeine cache entries     | `50000`             |
| `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER` | Enable virtual-thread Netty carriers | `true` (compose)    |
| `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_NUM_THREADS`  | Netty event-loop thread count        | CPU limit           |
| `MICRONAUT_EXECUTORS_PLATFORM_NTHREADS`            | Platform thread pool size            | CPU limit           |
| `MICRONAUT_SERVER_THREAD_SELECTION`                | Thread selection strategy            | `MANUAL`            |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                      | OpenTelemetry collector endpoint     | `http://alloy:4317` |
| `OTEL_SERVICE_NAME`                                | Service name for telemetry           | `micronaut-jvm`     |

### JVM Options (via `JAVA_TOOL_OPTIONS`)
```bash
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+UseStringDeduplication
-XX:+AlwaysPreTouch
-XX:+PreserveFramePointer
-XX:+DebugNonSafepoints
-XX:+UseContainerSupport
-XX:+ExitOnOutOfMemoryError
-XX:+HeapDumpOnOutOfMemoryError
-XX:NativeMemoryTracking=summary
-Xms64M -Xmx640M
-Djdk.tracePinnedThreads=full
--enable-native-access=ALL-UNNAMED
```

## Observability

### OpenTelemetry Integration (SDK-based, no Java agent)

This module wires the **OpenTelemetry SDK** at compile-time via Micronaut's tracing module — no `-javaagent` required.

#### Traces
- `micronaut-tracing-opentelemetry-http` auto-instruments inbound and outbound HTTP spans
- Exported via **OTLP gRPC** to Alloy → Tempo

#### Metrics
- **Micrometer → OTel bridge**: `OtelConfig` creates an `OpenTelemetryMeterRegistry` bean that funnels all Micrometer metrics through the OTel SDK pipeline → Alloy → Mimir
- Micrometer's own OTLP registry is disabled to avoid duplicate exports

#### Logs
- **Logback OTel appender** (`opentelemetry-logback-appender-1.0`) feeds log records into the SDK's `BatchLogRecordProcessor` → Alloy → Loki
- Automatically correlates logs with active trace/span IDs

### Custom Application Metrics

#### `hello.request.count` (Counter)
Tracks request count per endpoint.

**Tags**:
- `endpoint`: `/hello/platform`, `/hello/virtual`, `/hello/virtual-event-loop`, or `/hello/reactive`

### Standard Metrics (Micrometer binders)
- HTTP server request metrics (via Micronaut web binder)
- JVM memory, GC, and thread metrics (via Micronaut JVM binder)
- Process memory (RSS, VSS) and thread metrics (via `micrometer-jvm-extras`)

### Profiling
- **eBPF Profiling**: Supported via Alloy/Pyroscope eBPF collector (no agent needed)
- **Pyroscope Java Agent**: Not wired by default; can be added via `JAVA_TOOL_OPTIONS` if needed

## Cache Implementation
- **Library**: Caffeine
- **Size**: 50,000 entries (configurable via `CACHE_SIZE`)
- **Eviction**: `expireAfterWrite(1 day)`
- **Pre-population**: 50,000 entries loaded at startup (keys `"1"`–`"50000"`, values `"value-1"`–`"value-50000"`)

## Thread Model Details

### Platform Threads (`/hello/platform`)
- Fixed thread pool (size = CPU limit)
- `@Blocking` + `@ExecuteOn("platform")` — offloads from event loop to the named pool
- Best for: CPU-bound work, blocking I/O with bounded concurrency

### Virtual Threads (`/hello/virtual`)
- `THREAD_PER_TASK` executor — each request gets a new virtual thread
- `@ExecuteOn("virtual")` — offloads from event loop to the virtual-thread executor
- Best for: high-concurrency I/O-bound workloads

### Virtual Event-Loop (`/hello/virtual-event-loop`)
- Runs directly on the Netty event loop (`@NonBlocking`)
- When `loom-carrier=true`, the event-loop thread is itself a virtual thread
- Experimental — excluded from headline benchmarks

### Reactive (`/hello/reactive`)
- Returns `Mono<String>` — Netty event loop processes the response without blocking
- `@NonBlocking` — stays on the event loop
- Best for: asynchronous, non-blocking pipelines

## Performance Characteristics

### Benchmark Results (2 vCPU limit, 28/02/2026)

| Mode     | RPS    |
|----------|--------|
| Virtual  | 37,000 |
| Reactive | 31,000 |
| Platform | 30,000 |

### Resource Usage
- **Heap Memory**: 640 MB (configurable)
- **Off-Heap**: 32 MB max
- **Peak Memory (observed)**: ~431 MB
- **Container Image Size**: ~352 MB
- **Startup Time**: ~2–3 seconds (JVM)

## Building and Running

### Prerequisites
- Java 25 (Eclipse Temurin recommended)
- Maven 3.9+
- Docker (for containerised deployment)

### Docker Build
```bash
cd services/java
docker build -f micronaut/jvm/Dockerfile -t micronaut-jvm:latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up micronaut-jvm -d
```

### Local Development
```bash
cd services/java/micronaut/jvm
mvn mn:run
```

## Testing

### Health Checks
```bash
curl http://localhost:8092/health
```

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8092/hello/platform"

# Virtual threads
curl "http://localhost:8092/hello/virtual"

# Reactive
curl "http://localhost:8092/hello/reactive"

# With logging
curl "http://localhost:8092/hello/virtual?log=true"

# With simulated latency
curl "http://localhost:8092/hello/platform?sleep=2"
```

### Unit Tests
```bash
cd services/java/micronaut/jvm
mvn test
```

Tests include:
- `HelloControllerTest` — HTTP-level endpoint tests via Micronaut's embedded server
- `MetricsWiringTest` — verifies Micrometer registry and OTel bridge wiring

### Checkstyle
```bash
cd services/java/micronaut/jvm
mvn checkstyle:check
```

## Monitoring in Grafana

### Key Queries
```promql
# RPS by endpoint
rate(hello_request_count_total{service_name="micronaut-jvm"}[1m])

# Heap usage
jvm_memory_used_bytes{service_name="micronaut-jvm", area="heap"}

# RSS
process_memory_rss_bytes{service_name="micronaut-jvm"}
```

## Dependencies

### Key Runtime Dependencies
| Dependency                             | Purpose                          |
|----------------------------------------|----------------------------------|
| `micronaut-http-server-netty`          | Netty-based HTTP server          |
| `micronaut-runtime`                    | DI container and lifecycle       |
| `micronaut-tracing-opentelemetry-http` | OTel HTTP trace instrumentation  |
| `opentelemetry-exporter-otlp`          | OTLP gRPC exporter               |
| `opentelemetry-micrometer-1.5`         | Micrometer → OTel metrics bridge |
| `opentelemetry-logback-appender-1.0`   | Logback → OTel log pipeline      |
| `micronaut-micrometer-core`            | Micrometer meter registry        |
| `caffeine`                             | High-performance caching         |
| `reactor-core`                         | Reactive types (Mono/Flux)       |
| `micrometer-jvm-extras`                | Process memory & thread metrics  |

### Build-Time Only
| Dependency              | Purpose                              |
|-------------------------|--------------------------------------|
| `micronaut-inject-java` | Compile-time DI annotation processor |
| `lombok`                | Boilerplate reduction                |
| `jspecify`              | Nullness annotations                 |

## Known Issues
- The `loom-carrier` property is experimental and not supported in native builds (requires `--add-opens` which is JVM-only)
- `virtual-event-loop` endpoint is experimental and excluded from headline benchmarks
- Micronaut's OTel tracing module does not auto-configure Pyroscope agent extensions

## Contributing
When modifying this service:
1. Keep the hexagonal architecture boundaries — application ports must not depend on infra details
2. Verify all four endpoints work after changes
3. Run `mvn checkstyle:check` before committing
4. Update this README if configuration or endpoints change
5. Keep the native module in sync — it shares this module's sources via `build-helper-maven-plugin`

## References
- [Micronaut Documentation](https://docs.micronaut.io/latest/guide/)
- [Micronaut HTTP Server](https://docs.micronaut.io/latest/guide/#httpServer)
- [Micronaut Tracing (OpenTelemetry)](https://micronaut-projects.github.io/micronaut-tracing/latest/guide/#openTelemetry)
- [Micronaut Micrometer](https://micronaut-projects.github.io/micronaut-micrometer/latest/guide/)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
- [OpenTelemetry Java SDK](https://opentelemetry.io/docs/languages/java/)

