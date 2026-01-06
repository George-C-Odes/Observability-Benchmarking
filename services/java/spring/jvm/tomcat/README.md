# Spring Boot Tomcat JVM Service

## Overview
A REST service implementation built with Spring Boot 4.0.1 running on Apache Tomcat embedded server with the Java Virtual Machine (JVM 25). This service can be configured to run in either platform thread mode or virtual thread mode, but only one mode per deployment.

## Purpose
- Benchmark Spring Boot with Tomcat web server across different thread models
- Compare platform threads vs virtual threads in a Spring Boot context
- Provide traditional Spring Boot application structure with full observability
- Demonstrate Spring Boot 4.0 (with Spring Framework 7) performance characteristics

## Service Details

### Framework & Runtime
- **Framework**: Spring Boot 4.0.1
- **Web Server**: Apache Tomcat (embedded)
- **Java Version**: Amazon Corretto 25.0.1
- **JVM GC**: G1 Garbage Collector
- **Thread Models**: Platform OR Virtual (single mode per deployment)

### Endpoints

#### `GET /hello/platform`
Handles requests using standard JVM platform threads with Tomcat's thread pool.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (for testing blocking operations)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Boot platform REST {value}"`

**Thread Info**: `http-nio-...` (Tomcat NIO threads)

**Availability**: Only when `spring.threads.virtual.enabled=false`

#### `GET /hello/virtual`
Handles requests using Java virtual threads.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Boot virtual REST {value}"`

**Thread Info**: `VirtualThread[#N]`

**Availability**: Only when `spring.threads.virtual.enabled=true`

## Configuration Options

### Environment Variables

| Variable | Description | Default/Configured |
|----------|-------------|-------------------|
| `JAVA_TOOL_OPTIONS` | JVM options (GC, memory, OTEL agent, etc.) | Set by compose |
| `SPRING_THREADS_VIRTUAL_ENABLED` | Enable virtual threads | `true` or `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317` |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `SpringTomcat` |
| `SPRING_APPLICATION_NAME` | Spring application name | `SpringTomcat` |

### Application Configuration (application.yml)

#### Tomcat Server
```yaml
server:
  tomcat:
    accept-count: 2000           # Backlog queue size
    connection-timeout: 5000     # Connection timeout (ms)
    keep-alive-timeout: 5000     # Keep-alive timeout (ms)
    max-connections: 20000       # Maximum concurrent connections
    max-keep-alive-requests: 1000 # Max requests per connection
    mbeanregistry:
      enabled: true              # Enable MBean registry
    threads:
      max: 500                   # Maximum worker threads
      min-spare: 100             # Minimum spare threads
```

#### Threading
```yaml
spring:
  threads:
    virtual:
      enabled: false  # Platform mode (or true for virtual mode)
```

#### Logging
```yaml
logging:
  pattern:
    level: "%5p [traceId=%X{traceId:-}, spanId=%X{spanId:-}]"
```

#### Management & Metrics
```yaml
management:
  endpoint:
    health:
      show-details: never
  endpoints:
    web:
      base-path: /actuator
      exposure:
        include: health,prometheus,metrics,info
  metrics:
    tags:
      application: ${spring.application.name}
  otlp:
    metrics:
      export:
        enabled: true
  tracing:
    enabled: true
```

### JVM Options (via JAVA_TOOL_OPTIONS)
```bash
# Memory Management
-Xms1280M -Xmx1280M
-XX:MaxDirectMemorySize=64M

# Garbage Collection
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200
-XX:+UseStringDeduplication

# Performance & Monitoring
-XX:+AlwaysPreTouch
-XX:+PreserveFramePointer
-XX:+DebugNonSafepoints
-XX:NativeMemoryTracking=summary

# Virtual Threads (when enabled)
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
- `endpoint`: `/hello/platform` or `/hello/virtual`

**Instrumentation**: Manually incremented in each endpoint handler

### Standard Spring Boot Actuator Metrics

#### HTTP Server Metrics
- `http.server.requests` - Request duration and count
- Tags include: `uri`, `method`, `status`, `outcome`

⚠️ **Known Issue**: Not all Spring Boot 4.0 metrics are available due to OTEL Java agent compatibility issues (see [opentelemetry-java-instrumentation#14906](https://github.com/open-telemetry/opentelemetry-java-instrumentation/issues/14906))

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

#### Tomcat Metrics
- `tomcat.threads.current` - Current thread count
- `tomcat.threads.busy` - Busy thread count
- `tomcat.connections.current` - Current connections
- `tomcat.connections.keepalive.current` - Keep-alive connections

### OpenTelemetry Integration

#### Metrics Export
- **Protocol**: OTLP gRPC
- **Endpoint**: Configured via `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Batching**: Enabled with configurable batch size and delay

#### Distributed Tracing
- **Propagation**: W3C Trace Context
- **Sampling**: All requests (for benchmarking)
- **Span Attributes**: HTTP method, URI, status code
- **Automatic Instrumentation**: Via OpenTelemetry Java Agent

#### Logging
- **Format**: Includes trace ID and span ID
- **Correlation**: Automatic trace-log correlation
- **Export**: Via console output to Docker logs → Loki

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

#### Platform Threads Mode
- **Activation**: `SPRING_THREADS_VIRTUAL_ENABLED=false`
- **Thread Pool**: Tomcat's worker thread pool
- **Pool Size**: Max 500 threads, min spare 100
- **Thread Naming**: `http-nio-8080-exec-N`
- **Behavior**: Blocking operations consume a thread from the pool
- **Best for**: CPU-bound tasks, traditional blocking code

#### Virtual Threads Mode
- **Activation**: `SPRING_THREADS_VIRTUAL_ENABLED=true`
- **Implementation**: Java 21+ virtual threads (Project Loom)
- **Characteristics**: Lightweight, automatically yield when blocking
- **Thread Naming**: `VirtualThread[#N]`
- **Behavior**: Can handle millions of concurrent requests
- **Best for**: High-concurrency I/O-bound tasks

### Deployment Strategy
Unlike Quarkus (which supports all modes in one deployment), Spring Tomcat requires:
- **Separate deployments** for platform vs virtual thread modes
- **Different container configurations** in docker-compose
- **Mode selection** via environment variable at startup

## Performance Characteristics

### Benchmark Results (4 vCPU limit)

| Mode | RPS | Rank |
|------|-----|------|
| Virtual | 38,000 | #6 |
| Platform | 35,000 | #8 |

### Analysis
- Virtual threads provide ~9% improvement over platform threads
- Performance is lower than Quarkus JVM due to:
  - Spring's more extensive middleware/filter chain
  - Additional Spring Boot autoconfiguration overhead
  - Different connection handling model (Tomcat vs Vert.x)

### Resource Usage
- **Heap Memory**: 1280 MB (configurable)
- **Off-Heap Memory**: 64 MB max
- **Startup Time**: ~3-4 seconds
- **Container Size**: ~400 MB (with JDK)

## Building and Running

### Prerequisites
- Java 25 (Amazon Corretto recommended)
- Maven 3.9+
- Docker (for containerized deployment)

### Local Development
```bash
cd services/spring/jvm/tomcat

# Platform threads
./mvnw spring-boot:run

# Virtual threads (set in application.yml or via env)
SPRING_THREADS_VIRTUAL_ENABLED=true ./mvnw spring-boot:run
```

### Production Build
```bash
cd services/spring/jvm/tomcat
./mvnw clean package -DskipTests
```

### Docker Build
```bash
cd services/spring/jvm
docker build --build-arg PROFILE=tomcat -t spring-jvm-tomcat:latest .
```

### Docker Compose

#### Platform Threads
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_JVM_TOMCAT_PLATFORM=SERVICES \
  up spring-jvm-tomcat-platform -d
```

#### Virtual Threads
```bash
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_JVM_TOMCAT_VIRTUAL=SERVICES \
  up spring-jvm-tomcat-virtual -d
```

## Testing

### Health Checks
```bash
# Health endpoint
curl http://localhost:8080/actuator/health

# Expected: {"status":"UP"}
```

### Endpoint Testing
```bash
# Platform mode
curl "http://localhost:8080/hello/platform"

# Virtual mode (when enabled)
curl "http://localhost:8080/hello/virtual"

# With logging enabled
curl "http://localhost:8080/hello/platform?log=true"

# With sleep (testing blocking)
curl "http://localhost:8080/hello/virtual?sleep=1"
```

### Actuator Endpoints
```bash
# All actuator endpoints
curl http://localhost:8080/actuator

# Metrics
curl http://localhost:8080/actuator/metrics

# Specific metric
curl http://localhost:8080/actuator/metrics/jvm.memory.used

# Prometheus metrics
curl http://localhost:8080/actuator/prometheus
```

## Monitoring in Grafana

### Key Queries (PromQL)

#### RPS per Endpoint
```promql
rate(hello_request_count_total{service_name="SpringTomcat"}[1m])
```

#### HTTP Request Rate (when available)
```promql
rate(http_server_requests_seconds_count{service_name="SpringTomcat"}[1m])
```

#### Heap Usage
```promql
sum by (service_name) (jvm_memory_used_bytes{service_name="SpringTomcat",area="heap"})
```

#### Tomcat Threads
```promql
tomcat_threads_busy_threads{service_name="SpringTomcat"}
```

## Dependencies

### Key Dependencies (pom.xml)
- `org.springframework.boot:spring-boot-starter-web` - Web MVC with Tomcat
- `org.springframework.boot:spring-boot-starter-actuator` - Metrics and monitoring
- `io.micrometer:micrometer-registry-otlp` - OTLP metrics export
- `com.github.ben-manes.caffeine:caffeine` - In-memory cache
- `io.github.mweirauch:micrometer-jvm-extras` - Enhanced JVM metrics

### Runtime Dependencies
- OpenTelemetry Java Agent (injected at runtime)
- Pyroscope OTEL extension (injected at runtime)

## Known Issues

### Metrics Compatibility (Spring Boot 4.0)
⚠️ **OTEL SDK not fully compatible** with Spring Boot 4 yet:
- Some metrics may be missing
- Workaround: Use native Spring metrics or wait for OTEL update
- Issue: [opentelemetry-java-instrumentation#14906](https://github.com/open-telemetry/opentelemetry-java-instrumentation/issues/14906)

### Pyroscope Agent Overhead
- Java profiling agent adds measurable overhead (~5-10% throughput reduction)
- Disabled by default in benchmarks
- Set `PROFILING_AGENT=true` to enable

## Comparison: Tomcat vs Netty

| Feature | Tomcat | Netty |
|---------|--------|-------|
| Model | Thread-per-request (traditional) | Event-driven (reactive) |
| Spring Mode | Imperative (WebMVC) | Reactive (WebFlux) |
| Thread Naming | `http-nio-...` | `reactor-http-nio-...` |
| Maturity | Very mature, widely used | Modern, reactive stack |
| Spring Integration | Deep, extensive | Reactive-specific |

## Contributing
When modifying this service:
1. Test both platform and virtual thread modes separately
2. Ensure metrics are properly tagged with endpoint names
3. Keep cache size consistent for benchmarking (50,000 entries)
4. Update both tomcat and netty variants if applicable
5. Document configuration changes in this README

## References
- [Spring Boot Documentation](https://docs.spring.io/spring-boot/docs/4.0.x/reference/)
- [Apache Tomcat](https://tomcat.apache.org/)
- [Spring Boot Actuator](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html)
- [Virtual Threads in Spring Boot](https://spring.io/blog/2022/10/11/embracing-virtual-threads)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
