# Helidon JVM Service

## Overview
A high-performance REST service implementation built with Helidon 4.3.2 running on the Java Virtual Machine (JVM 25). This service supports three different thread models for benchmarking different concurrency approaches.

## Purpose
- Benchmark Helidon performance across platform threads, virtual threads, and reactive programming models
- Demonstrate Helidon's lightweight and modern microservices approach
- Provide comprehensive observability with metrics, traces, logs, and profiles
- Exercise high-concurrency cache retrieval patterns

## Service Details

### Framework & Runtime
- **Framework**: Helidon 4.3.2 (SE - reactive)
- **Java Version**: Amazon Corretto 25.0.1
- **JVM GC**: G1 Garbage Collector
- **Thread Models**: Platform, Virtual, and Reactive

### Endpoints

#### `GET /hello/platform`
Handles requests using standard JVM platform threads.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Helidon platform REST {value}"`

#### `GET /hello/virtual`
Handles requests using Java virtual threads (Project Loom).

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Helidon virtual REST {value}"`

#### `GET /hello/reactive`
Handles requests using reactive/async programming on event loop threads.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Helidon reactive REST {value}"`

## Configuration Options

### Environment Variables

| Variable | Description | Default/Configured |
|----------|-------------|-------------------|
| `JAVA_TOOL_OPTIONS` | JVM options (GC, memory, OTEL agent, etc.) | Set by compose |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317` |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `helidon-jvm` |

### Application Configuration (application.yaml)

#### HTTP Server
```yaml
server:
  port: 8080
  host: 0.0.0.0
  max-concurrent-requests: 10000
```

#### Observability
```yaml
server:
  features:
    observe:
      enabled: true
      endpoint: "/observe"
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
- Best for: CPU-bound tasks, legacy blocking code

#### Virtual Threads (`/virtual`)
- Uses Java 21+ virtual threads (Project Loom)
- Lightweight threads managed by JVM
- Can create millions without significant overhead
- Best for: High-concurrency I/O-bound tasks

#### Reactive (`/reactive`)
- Uses Helidon's reactive/async programming model
- Non-blocking I/O operations on event loop
- Best for: Asynchronous, non-blocking workloads

## Building and Running

### Prerequisites
- Java 25 (Amazon Corretto recommended)
- Maven 3.9+
- Docker (for containerized deployment)

### Local Development
```bash
cd services/helidon/jvm
mvn clean package
java -cp target/helidon-jvm-1.0.0-SNAPSHOT.jar:target/libs/* com.benchmarking.Main
```

### Docker Build
```bash
cd services
docker build -f helidon/jvm/Dockerfile -t helidon-jvm:4.3.2_latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up helidon-jvm -d
```

## Testing

### Health Checks
```bash
# Health
curl http://localhost:8088/observe/health

# Metrics
curl http://localhost:8088/observe/metrics
```

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8088/hello/platform"

# Virtual threads
curl "http://localhost:8088/hello/virtual"

# Reactive
curl "http://localhost:8088/hello/reactive"

# With logging enabled
curl "http://localhost:8088/hello/platform?log=true"

# With sleep (testing blocking)
curl "http://localhost:8088/hello/virtual?sleep=1"
```

## Dependencies

### Key Dependencies (pom.xml)
- `io.helidon.webserver:helidon-webserver` - Core web server
- `io.helidon.config:helidon-config-yaml` - YAML configuration
- `io.helidon.webserver.observe:helidon-webserver-observe-health` - Health checks
- `io.helidon.webserver.observe:helidon-webserver-observe-metrics` - Metrics
- `com.github.ben-manes.caffeine:caffeine` - In-memory cache

## Contributing
When modifying this service:
1. Test all three thread models (/platform, /virtual, /reactive)
2. Keep cache size consistent for benchmarking (50,000 entries)
3. Document configuration changes in this README
4. Update application.yaml with appropriate comments

## References
- [Helidon Documentation](https://helidon.io/docs/v4/)
- [Helidon WebServer](https://helidon.io/docs/v4/se/webserver)
- [Helidon Observability](https://helidon.io/docs/v4/se/observability)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
