# Micronaut JVM Service

## Overview
A high-performance REST service implementation built with Micronaut 4.10.5 running on the Java Virtual Machine (JVM 25). This service supports three different thread models for benchmarking different concurrency approaches.

## Purpose
- Benchmark Micronaut performance across platform threads, virtual threads, and reactive programming models
- Demonstrate Micronaut's compile-time dependency injection and ahead-of-time optimizations
- Provide comprehensive observability with metrics, traces, logs, and profiles
- Exercise high-concurrency cache retrieval patterns

## Service Details

### Framework & Runtime
- **Framework**: Micronaut 4.10.5
- **Java Version**: Amazon Corretto 25.0.1
- **JVM GC**: G1 Garbage Collector
- **Thread Models**: Platform, Virtual, and Reactive
- **Web Server**: Netty

### Endpoints

#### `GET /hello/platform`
Handles requests using standard JVM platform threads.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Micronaut platform REST {value}"`

#### `GET /hello/virtual`
Handles requests using Java virtual threads (Project Loom) when enabled.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Micronaut virtual REST {value}"`

#### `GET /hello/reactive`
Handles requests using reactive programming with Project Reactor.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Micronaut reactive REST {value}"`

## Configuration Options

### Environment Variables

| Variable | Description | Default/Configured |
|----------|-------------|-------------------|
| `JAVA_TOOL_OPTIONS` | JVM options (GC, memory, OTEL agent, etc.) | Set by compose |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317` |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `micronaut-jvm` |

### Application Configuration (application.yml)

#### HTTP Server
```yaml
micronaut:
  server:
    port: 8080
    host: 0.0.0.0
    netty:
      worker:
        threads: 32
      event-loops:
        default:
          num-threads: 8
```

#### Executors
```yaml
micronaut:
  executors:
    blocking:
      type: FIXED
      nThreads: 200
      virtual: true  # Enable virtual threads
```

#### Metrics
```yaml
micronaut:
  metrics:
    enabled: true
    export:
      prometheus:
        enabled: true
        step: PT15S
```

### JVM Options (via JAVA_TOOL_OPTIONS)
```bash
# Memory Management
-Xms1536M -Xmx1536M
-XX:MaxDirectMemorySize=256M

# Garbage Collection
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+UseStringDeduplication

# Performance & Monitoring
-XX:+AlwaysPreTouch
-XX:+PreserveFramePointer
-XX:+DebugNonSafepoints

# Virtual Threads
-Djdk.tracePinnedThreads=full

# OpenTelemetry Java Agent
-javaagent:/work/opentelemetry-javaagent.jar
-Dotel.javaagent.extensions=/work/pyroscope-otel-extension.jar

# Error Handling
-XX:+ExitOnOutOfMemoryError
```

## Architecture

### Cache Implementation
- **Library**: Caffeine (high-performance caching library)
- **Configuration**:
  - Maximum size: 50,000 entries
  - Expiration: 1 day after write
  - Type: `Cache<String, String>`
- **Pre-population**: 50,000 entries loaded at startup

### Thread Model Details

#### Platform Threads (`/platform`)
- Uses standard JVM thread pool
- Blocking operations consume a thread from the pool
- Configured with fixed thread pool (200 threads)
- Best for: CPU-bound tasks, legacy blocking code

#### Virtual Threads (`/virtual`)
- Uses Java 21+ virtual threads (Project Loom)
- Lightweight threads managed by JVM
- Can create millions without significant overhead
- Enabled via `virtual: true` in executor configuration
- Best for: High-concurrency I/O-bound tasks

#### Reactive (`/reactive`)
- Uses Project Reactor (Mono/Flux)
- Non-blocking I/O operations
- Netty event loop based
- Best for: Asynchronous, non-blocking workloads

## Building and Running

### Prerequisites
- Java 25 (Amazon Corretto recommended)
- Maven 3.9+
- Docker (for containerized deployment)

### Local Development
```bash
cd services/micronaut/jvm
mvn clean package
java -jar target/micronaut-jvm-1.0.0-SNAPSHOT.jar
```

### Docker Build
```bash
cd services
docker build -f micronaut/jvm/Dockerfile -t micronaut-jvm:4.10.5_latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up micronaut-jvm -d
```

## Testing

### Health Checks
```bash
# Health
curl http://localhost:8089/health

# Prometheus metrics
curl http://localhost:8089/prometheus
```

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8089/hello/platform"

# Virtual threads
curl "http://localhost:8089/hello/virtual"

# Reactive
curl "http://localhost:8089/hello/reactive"

# With logging enabled
curl "http://localhost:8089/hello/platform?log=true"

# With sleep (testing blocking)
curl "http://localhost:8089/hello/virtual?sleep=1"
```

## Observability Metrics

### Micrometer Metrics
- HTTP request metrics (count, duration)
- JVM memory metrics (heap, non-heap)
- Thread pool metrics
- System metrics (CPU, disk)

### OpenTelemetry Integration
- Distributed tracing
- Log correlation
- Metrics export to OTLP endpoint
- Profile-to-span correlation (when enabled)

## Dependencies

### Key Dependencies (pom.xml)
- `io.micronaut:micronaut-http-server-netty` - Netty-based HTTP server
- `io.micronaut:micronaut-management` - Management endpoints
- `io.micronaut.micrometer:micronaut-micrometer-core` - Metrics
- `io.micronaut.reactor:micronaut-reactor` - Reactive support
- `com.github.ben-manes.caffeine:caffeine` - In-memory cache

## Micronaut Features

### Compile-Time Dependency Injection
- No reflection at runtime
- Faster startup and lower memory footprint
- AOT (Ahead-of-Time) optimizations

### Netty Integration
- High-performance async I/O
- Event loop model
- Efficient connection handling

### Native Image Ready
- Designed for GraalVM native image compilation
- Minimal reflection usage
- Fast startup and low memory footprint in native mode

## Contributing
When modifying this service:
1. Test all three thread models (/platform, /virtual, /reactive)
2. Keep cache size consistent for benchmarking (50,000 entries)
3. Document configuration changes in this README
4. Update application.yml with appropriate comments

## References
- [Micronaut Documentation](https://docs.micronaut.io/latest/guide/)
- [Micronaut HTTP Server](https://docs.micronaut.io/latest/guide/#httpServer)
- [Micronaut Management & Monitoring](https://docs.micronaut.io/latest/guide/#management)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
