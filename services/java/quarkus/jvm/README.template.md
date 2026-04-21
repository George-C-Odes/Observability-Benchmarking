<!-- Generated from `services/java/quarkus/jvm/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `services/java/quarkus/jvm/README.md` directly. -->

# Quarkus JVM Service

## Overview
A high-performance REST service implementation built with Quarkus {{QUARKUS_VERSION}} running on the Java Virtual Machine (JVM 25). This service supports three different thread models in a single deployment, making it ideal for benchmarking different concurrency approaches.

## Purpose
- Benchmark Quarkus performance across platform threads, virtual threads, and reactive programming models
- Demonstrate Quarkus's unified programming model that supports all three thread modes
- Provide comprehensive observability with metrics, traces, logs, and profiles
- Exercise high-concurrency cache retrieval patterns

## Service Details

### Framework & Runtime
- **Framework**: Quarkus {{QUARKUS_VERSION}}
- **Java Version**: Eclipse Temurin 25.0.2
- **JVM GC**: G1 Garbage Collector
- **Thread Models**: Platform, Virtual, and Reactive (all in one deployment)

### Docker

**Image**: `quarkus-jvm:{{QUARKUS_VERSION}}_latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.9.14-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

This Docker image uses a multi-stage build:
- Builds a Quarkus **fast-jar**
- Uses `jdeps` + `jlink` to generate a **stripped-down custom JRE** (only required JDK modules)
- Runs on a **distroless** base image for a smaller attack surface (no package manager / shell)

> Note: `jdeps` is static analysis and can miss modules that are loaded via reflection/SPI at runtime.
> The Dockerfile intentionally forces `java.net.http` (OTLP exporters may resolve HTTP senders via SPI) and `java.management` (JVM metrics / MBeans).

### Endpoints

#### `GET /hello/platform`
Handles requests using standard JVM platform threads (traditional thread pool).

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Quarkus platform REST {value}"`

**Thread Info**: `Thread[#N,executor-thread-N,5,main]`

#### `GET /hello/virtual`
Handles requests using Java virtual threads (lightweight threads introduced in Java 21+).

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Quarkus virtual REST {value}"`

**Thread Info**: `VirtualThread[#N,vthread-N]`

#### `GET /hello/reactive`
Handles requests using reactive programming with Mutiny (non-blocking I/O).

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Quarkus reactive REST {value}"`

**Thread Info**: `Thread[#N,vert.x-eventloop-thread-N,5,main]`

## Configuration Options

### Environment Variables

| Variable                      | Description                                | Default/Configured |
|-------------------------------|--------------------------------------------|--------------------|
| `JAVA_TOOL_OPTIONS`           | JVM options (GC, memory, OTEL agent, etc.) | Set by compose     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint           | `alloy:4317`       |
| `OTEL_SERVICE_NAME`           | Service name for telemetry                 | `QuarkusJVM`       |
| `OTEL_RESOURCE_ATTRIBUTES`    | Additional OTEL resource attributes        | -                  |

### Application Configuration (application.yml)

#### HTTP Server
```yaml
quarkus:
  http:
    port: 8080
    accept-backlog: 10000
    idle-timeout: 60s
    io-threads: 16
    read-timeout: 1s
    limits:
      max-connections: 10000
```

#### Threading
```yaml
quarkus:
  thread-pool:
    max-threads: 200
  vertx:
    event-loops-pool-size: 40
  virtual-threads:
    enabled: true
    name-prefix: "vthread-"
```

#### Logging
```yaml
quarkus:
  log:
    level: INFO
    console:
      enabled: true
      json:
        enabled: true
      format: "%d{yyyy-MM-dd HH:mm:ss} %-5p [%c{2.}] (%t) %s%e%n"
    category:
      io.github.georgecodes.benchmarking.quarkus:
        level: INFO
```

#### Metrics (Micrometer)
```yaml
quarkus:
  micrometer:
    enabled: true
    binder:
      enable-all: false
      grpc-client:
        enabled: false
      grpc-server:
        enabled: false
      http-client:
        enabled: false
      http-server:
        enabled: false
      jvm: false
      netty:
        enabled: true
      system: true
      virtual-threads:
        enabled: true
      vertx:
        enabled: true
    export:
      json:
        enabled: true
        path: metrics/json
      prometheus:
        enabled: false
        path: metrics/prometheus
```

#### Health
```yaml
quarkus:
  smallrye-health:
    ui:
      enabled: false
```

### JVM Options (via JAVA_TOOL_OPTIONS)
```bash
# Memory Management
-Xms1280M -Xmx1280M
-XX:MaxDirectMemorySize=32M

# Garbage Collection
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+UseStringDeduplication

# Performance & Monitoring
-XX:+AlwaysPreTouch
-XX:+PreserveFramePointer
-XX:+DebugNonSafepoints
-XX:NativeMemoryTracking=summary

# Virtual Threads
-Djdk.tracePinnedThreads=full

# OpenTelemetry Java Agent
-javaagent:/work/opentelemetry-javaagent.jar

# Pyroscope Java Agent Extension
-Dotel.javaagent.extensions=/work/pyroscope-otel-extension.jar

# Error Handling
-XX:+ExitOnOutOfMemoryError
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/error
```

## Observability Metrics

### Custom Application Metrics

#### `hello.request.count` (Counter)
Tracks request count per endpoint.

**Tags**:
- `endpoint`: `/hello/platform`, `/hello/virtual`, or `/hello/reactive`

**Instrumentation**: Manually incremented in each endpoint handler

### Standard Micrometer Metrics

#### HTTP Server Metrics
- `http.server.requests` - Request duration and count
- `http.server.request.duration.seconds` - Request latency histogram
- Tags include: `uri`, `method`, `status`, `outcome`

#### JVM Metrics
- `jvm.memory.used` - Heap and non-heap memory usage
- `jvm.memory.committed` - Committed memory by pool
- `jvm.memory.max` - Maximum memory by pool
- `jvm.gc.pause` - GC pause times
- `jvm.gc.memory.allocated` - Memory allocation rate
- `jvm.threads.live` - Live thread count
- `jvm.threads.peak` - Peak thread count

#### Process Metrics (via micrometer-jvm-extras)
- `process.memory.vss` - Virtual Set Size
- `process.memory.rss` - Resident Set Size
- `process.threads` - OS-level thread count
- `process.open.fds` - Open file descriptors

#### Virtual Thread Metrics
- `quarkus.virtual.thread.count` - Active virtual threads
- `quarkus.virtual.thread.queued` - Queued virtual thread tasks

### OpenTelemetry Integration

#### Metrics Export
- **Protocol**: OTLP gRPC
- **Endpoint**: Configured via `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Batching**: Enabled with configurable batch size and delay

#### Distributed Tracing
- **Propagation**: W3C Trace Context
- **Sampling**: All requests (for benchmarking)
- **Span Attributes**: HTTP method, URI, status code, headers
- **Automatic Instrumentation**: Via OpenTelemetry Java Agent

#### Logging
- **Format**: JSON structured logs
- **Correlation**: Trace ID and Span ID included in logs
- **Export**: Via OpenTelemetry Log Appender to Loki

#### Profiling
- **Agent**: Pyroscope Java Agent (optional, can add overhead)
- **Method**: Async CPU profiler
- **Integration**: Via OpenTelemetry extension
- **Profile-to-Trace Correlation**: Supported when agent enabled

## Architecture

### Cache Implementation
- **Library**: Caffeine (high-performance caching library)
- **Configuration**:
  - Maximum size: 50,000 entries
  - Expiration: 1 day after write
  - Type: `Cache<String, String>`
- **Pre-population**: 50,000 entries loaded at startup (keys: "1"-"50000", values: "value-1"-"value-50000")

### Thread Model Details

#### Platform Threads (`/platform`)
- Uses standard JVM thread pool (executor-threads)
- Blocking operations consume a thread from the pool
- Pool size: Max 200 threads (configurable)
- Best for: CPU-bound tasks, legacy blocking code

#### Virtual Threads (`/virtual`)
- Uses Java 21+ virtual threads (Project Loom)
- Lightweight threads managed by JVM
- Can create millions without significant overhead
- Automatically yield when blocking
- Best for: High-concurrency I/O-bound tasks

#### Reactive (`/reactive`)
- Uses Mutiny reactive programming model
- Event-loop based (Vert.x under the hood)
- Non-blocking I/O operations
- Event loops: 40 threads (configurable)
- Best for: Asynchronous, non-blocking workloads

## Performance Characteristics

### Benchmark Results (2 vCPU limit)

| Mode     | RPS    |
|----------|--------|
| Reactive | 46,000 |
| Virtual  | 45,000 |
| Platform | 36,000 |

### Resource Usage
- **Heap Memory**: 640 MB (configurable)
- **Off-Heap Memory**: 32 MB max
- **Startup Time**: ~2-3 seconds (JVM)
- **Container Image Size**: ~235 MB (distroless + custom jlink JRE)

## Building and Running

### Prerequisites
- Java 25 (Eclipse Temurin recommended)
- Maven 3.9+
- Docker (for containerized deployment)

### Local Development
```bash
cd services/java/quarkus/jvm
mvn quarkus:dev
```

### Production Build
```bash
cd services/java/quarkus/jvm
mvn clean package -DskipTests
```

### Docker Build
```powershell
docker buildx build `
  -f services/java/quarkus/jvm/Dockerfile `
  -t quarkus-jvm:{{QUARKUS_VERSION}}_latest `
  --build-arg QUARKUS_VERSION={{QUARKUS_VERSION}} `
  --build-arg BUILDKIT_BUILD_NAME=quarkus-jvm:{{QUARKUS_VERSION}}_latest `
  --load `
  services/java
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up quarkus-jvm -d
```

## Testing

### Local Test + Coverage Run
```bash
cd services/java/quarkus/jvm
mvn verify -Dcheckstyle.skip=true
```

This generates the local JaCoCo reports at:
- `target/site/jacoco/index.html`
- `target/site/jacoco/jacoco.xml`

### Health Checks
```bash
# Readiness
curl http://localhost:8080/q/health/ready

# Liveness
curl http://localhost:8080/q/health/live
```

> Note: the SmallRye Health UI is currently disabled in `application.yml`.

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8080/hello/platform"

# Virtual threads
curl "http://localhost:8080/hello/virtual"

# Reactive
curl "http://localhost:8080/hello/reactive"

# With logging enabled
curl "http://localhost:8080/hello/platform?log=true"

# With sleep (testing blocking)
curl "http://localhost:8080/hello/virtual?sleep=1"
```

### Metrics
```bash
# JSON metrics endpoint
curl http://localhost:8080/q/metrics/json

# Prometheus-style metrics (if enabled)
curl http://localhost:8080/q/metrics/prometheus
```

## Monitoring in Grafana

### Key Queries (PromQL)

#### RPS per Endpoint
```promql
rate(hello_request_count_total[1m])
```

#### HTTP Request Rate
```promql
rate(http_server_request_duration_seconds_count{service_name="QuarkusJVM"}[1m])
```

#### Heap Usage
```promql
sum by (service_name) (jvm_memory_used_bytes{area="heap"})
```

#### Free Heap
```promql
sum by (service_name) (jvm_memory_committed_bytes - jvm_memory_used_bytes) / 1024 / 1024
```

#### GC Pause Time
```promql
rate(jvm_gc_pause_seconds_sum[1m])
```

## Dependencies

### Key Dependencies (pom.xml)
- `io.quarkus:quarkus-config-yaml` - YAML-based Quarkus configuration
- `io.quarkus:quarkus-rest` - RESTful web services
- `io.quarkus:quarkus-rest-jackson` - JSON serialization
- `io.quarkus:quarkus-arc` - CDI / dependency injection
- `io.quarkus:quarkus-micrometer-opentelemetry` - Micrometer metrics bridged into OpenTelemetry
- `io.quarkus:quarkus-smallrye-health` - Health checks
- `io.quarkus:quarkus-caffeine` - Caffeine-backed cache integration
- `io.github.mweirauch:micrometer-jvm-extras` - Enhanced JVM metrics

## Known Issues
- None currently identified for JVM builds
- Native builds may have metrics disappearing after some time (see quarkus/native README)

## Contributing
When modifying this service:
1. Test all three thread models (/platform, /virtual, /reactive)
2. Ensure metrics are properly tagged with endpoint names
3. Keep cache size consistent for benchmarking (50,000 entries)
4. Document configuration changes in this README
5. Update application.yml with appropriate comments

## References
- [Quarkus Documentation](https://quarkus.io/guides/)
- [Quarkus Virtual Threads](https://quarkus.io/guides/virtual-threads)
- [Quarkus Reactive](https://quarkus.io/guides/mutiny-primer)
- [Micrometer Metrics](https://micrometer.io/docs)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
