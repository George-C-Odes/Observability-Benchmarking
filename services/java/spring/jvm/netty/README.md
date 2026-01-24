# Spring Boot Netty JVM Service

## Overview
A reactive REST service implementation built with Spring Boot 4.0.2 running on Netty web server (via Spring WebFlux) with the Java Virtual Machine (JVM 25). This service uses reactive programming with Project Reactor for non-blocking, event-driven request handling.

## Purpose
- Benchmark Spring Boot with reactive WebFlux stack on Netty
- Demonstrate reactive programming model performance in Spring
- Compare reactive approach against platform/virtual thread models
- Provide full observability for reactive Spring applications

## Service Details

### Framework & Runtime
- **Framework**: Spring Boot 4.0.2 + Spring WebFlux
- **Web Server**: Netty (event-loop based)
- **Java Version**: Amazon Corretto 25.0.1
- **JVM GC**: G1 Garbage Collector
- **Concurrency Model**: Reactive (Project Reactor)

### Endpoints

#### `GET /hello/reactive`
Handles requests using reactive programming model with Mono (single async value).

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (not recommended under load, blocks event loop)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Boot reactive REST {value}"`

**Thread Info**: `reactor-http-nio-...` (Netty event loop threads)

**Note**: This service only implements the reactive endpoint, not platform or virtual thread variants.

## Configuration Options

### Environment Variables

| Variable | Description | Default/Configured |
|----------|-------------|-------------------|
| `JAVA_TOOL_OPTIONS` | JVM options (GC, memory, OTEL agent, etc.) | Set by compose |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317` |
| `OTEL_SERVICE_NAME` | Service name for telemetry | `SpringNetty` |
| `SPRING_APPLICATION_NAME` | Spring application name | `SpringNetty` |

### Application Configuration (application.yml)

#### Threading
```yaml
spring:
  threads:
    virtual:
      enabled: false  # Not applicable for reactive/WebFlux
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

**Note**: Netty-specific tuning (event loop size, buffer sizes) can be configured via WebFlux properties or programmatically.

### JVM Options (via JAVA_TOOL_OPTIONS)
Same as Tomcat variant:
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
Tracks request count for the reactive endpoint.

**Tags**:
- `endpoint`: `/hello/reactive`

**Instrumentation**: Manually incremented in endpoint handler

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
- `jvm.threads.live` - Live thread count (event loop threads)
- `jvm.threads.peak` - Peak thread count

#### Process Metrics (via micrometer-jvm-extras)
- `process.memory.vss` - Virtual Set Size
- `process.memory.rss` - Resident Set Size
- `process.threads` - OS-level thread count
- `process.open.fds` - Open file descriptors

#### Netty/Reactor Metrics
- Netty buffer pool metrics
- Reactor scheduler metrics (when available)
- Event loop metrics

### OpenTelemetry Integration

#### Metrics Export
- **Protocol**: OTLP gRPC
- **Endpoint**: Configured via `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Batching**: Enabled with configurable batch size and delay

#### Distributed Tracing
- **Propagation**: W3C Trace Context
- **Reactive Support**: Traces propagate through Reactor contexts
- **Span Attributes**: HTTP method, URI, status code
- **Automatic Instrumentation**: Via OpenTelemetry Java Agent

#### Logging
- **Format**: Includes trace ID and span ID
- **Correlation**: Automatic trace-log correlation in reactive chains
- **Export**: Via console output to Docker logs → Loki

#### Profiling
- **Agent**: Pyroscope Java Agent (optional, can add overhead)
- **Reactive Context**: May not capture full reactive execution paths
- **Integration**: Via OpenTelemetry extension

## Architecture

### Cache Implementation
- **Library**: Caffeine (high-performance caching library)
- **Configuration**:
  - Maximum size: 50,000 entries
  - Expiration: 1 day after write
  - Type: `Cache<String, String>`
- **Pre-population**: 50,000 entries loaded at startup (keys: "1"-"50000", values: "value-1"-"value-50000")
- **Access Pattern**: Synchronous cache lookup within reactive chain (not ideal but matches other services)

### Reactive Programming Model

#### Project Reactor
- **Mono**: Single async value (0 or 1 element)
- **Flux**: Stream of async values (0 to N elements)
- **Backpressure**: Built-in flow control
- **Operators**: Composable transformation pipeline

#### Event Loop Threading
- **Model**: Small pool of event loop threads (typically CPU count * 2)
- **Thread Naming**: `reactor-http-nio-N`
- **Behavior**: Non-blocking, event-driven
- **Characteristics**:
  - Never block an event loop thread
  - Cache lookup is synchronous (not ideal but simple)
  - I/O operations should be non-blocking
  - CPU-intensive work should be offloaded

#### Request Flow
1. Request arrives on Netty event loop thread
2. `Mono.fromSupplier()` wraps synchronous cache operation
3. Counter incremented (synchronous)
4. Cache lookup performed (synchronous, but fast)
5. Response returned via reactive chain
6. Event loop thread freed for next request

### Performance Characteristics

#### Benchmark Results (4 vCPU limit)

| Mode | RPS | Rank | vs Tomcat Platform |
|------|-----|------|--------------------|
| Reactive | 29,000 | #9 | -17% |

#### Analysis
- **Lower than expected**: Reactive model performs worse than platform threads
- **Reasons**:
  - Synchronous cache lookup in reactive chain (anti-pattern)
  - Spring WebFlux overhead for simple workloads
  - Reactor context switching costs
  - Small CPU-bound task doesn't benefit from non-blocking I/O
- **When reactive shines**:
  - High I/O wait times (database, external APIs)
  - Need for backpressure handling
  - Streaming data scenarios
  - Very high concurrency (100K+ connections)

### Resource Usage
- **Heap Memory**: 1280 MB (configurable)
- **Off-Heap Memory**: 64 MB max (Netty uses direct buffers)
- **Event Loop Threads**: Small number (default: available processors)
- **Startup Time**: ~3-4 seconds
- **Container Size**: ~400 MB (with JDK)

## Building and Running

### Prerequisites
- Java 25 (Amazon Corretto recommended)
- Maven 3.9+
- Docker (for containerized deployment)

### Local Development
```bash
cd services/spring/jvm/netty
./mvnw spring-boot:run
```

### Production Build
```bash
cd services/spring/jvm/netty
./mvnw clean package -DskipTests
```

### Docker Build
```bash
cd services/spring/jvm
docker build --build-arg PROFILE=netty -t spring-jvm-netty:latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_JVM_NETTY=SERVICES \
  up spring-jvm-netty -d
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
# Reactive endpoint
curl "http://localhost:8080/hello/reactive"

# With logging enabled
curl "http://localhost:8080/hello/reactive?log=true"

# With sleep (NOT recommended under load - blocks event loop!)
curl "http://localhost:8080/hello/reactive?sleep=1"
```

### Actuator Endpoints
```bash
# All actuator endpoints
curl http://localhost:8080/actuator

# Metrics
curl http://localhost:8080/actuator/metrics

# Prometheus metrics
curl http://localhost:8080/actuator/prometheus
```

## Monitoring in Grafana

### Key Queries (PromQL)

#### RPS
```promql
rate(hello_request_count_total{service_name="SpringNetty"}[1m])
```

#### HTTP Request Rate (when available)
```promql
rate(http_server_requests_seconds_count{service_name="SpringNetty"}[1m])
```

#### Heap Usage
```promql
sum by (service_name) (jvm_memory_used_bytes{service_name="SpringNetty",area="heap"})
```

#### Direct Buffer Usage (Netty)
```promql
jvm_memory_used_bytes{service_name="SpringNetty",id="direct"}
```

## Dependencies

### Key Dependencies (pom.xml)
- `org.springframework.boot:spring-boot-starter-webflux` - Reactive web with Netty
- `org.springframework.boot:spring-boot-starter-actuator` - Metrics and monitoring
- `io.projectreactor:reactor-core` - Reactive programming library
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
- Issue: [opentelemetry-java-instrumentation#14906](https://github.com/open-telemetry/opentelemetry-java-instrumentation/issues/14906)

### Performance Lower Than Expected
- Reactive model underperforms for this simple cache-lookup workload
- Synchronous cache access in reactive chain is an anti-pattern
- Better suited for I/O-bound scenarios

### Blocking Operations Warning
⚠️ **Never block event loop threads**:
- The `sleep` parameter blocks the event loop (demo only)
- In production, use `Mono.delay()` for delays
- Offload blocking operations to separate scheduler

## Reactive Best Practices

### Do's ✅
- Use non-blocking I/O operations (databases, HTTP clients)
- Chain operations with operators (.map(), .flatMap(), etc.)
- Use `Mono.defer()` or `.subscribeOn()` for delayed execution
- Leverage backpressure for flow control
- Use reactive database drivers (R2DBC)

### Don'ts ❌
- Don't block event loop threads (Thread.sleep, blocking I/O)
- Don't use synchronous/blocking libraries in reactive chains
- Don't ignore backpressure
- Don't mix blocking and reactive code without proper scheduling

## Comparison: Netty (Reactive) vs Tomcat (Imperative)

| Aspect | Netty/Reactive | Tomcat/Imperative |
|--------|----------------|-------------------|
| Model | Event-driven, non-blocking | Thread-per-request |
| Threads | Few event loops | Large thread pool |
| Blocking | Must avoid | Can block freely |
| Concurrency | Very high (millions) | Limited by threads |
| Complexity | Higher (reactive chains) | Lower (imperative) |
| Learning Curve | Steep | Gentle |
| Best For | I/O-bound, streaming | CPU-bound, CRUD |
| This Benchmark | Underperforms | Better suited |

## Improving Reactive Performance

To better leverage reactive model in this service:
1. **Use reactive cache**: Replace Caffeine with reactive cache (e.g., Redis with Lettuce)
2. **Proper operators**: Use `Mono.fromCallable()` with `.subscribeOn()` for blocking cache
3. **Add I/O**: Introduce database or external API calls
4. **Increase concurrency**: Test with much higher load (100K+ req/s)
5. **Streaming**: Implement streaming endpoints with `Flux`

## Contributing
When modifying this service:
1. Maintain reactive programming patterns (avoid blocking)
2. Ensure metrics are properly tagged
3. Keep cache size consistent for benchmarking (50,000 entries)
4. Consider adding proper reactive cache for better performance
5. Document configuration changes in this README

## References
- [Spring WebFlux Documentation](https://docs.spring.io/spring-framework/reference/web/webflux.html)
- [Project Reactor](https://projectreactor.io/)
- [Netty](https://netty.io/)
- [Reactive Streams Specification](https://www.reactive-streams.org/)
- [Spring Boot Actuator](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html)
