---
layout: default
title: Tools & Technologies
---

# Tools & Technologies

A comprehensive overview of all tools, frameworks, and technologies used in this project.

## Table of Contents
- [Application Frameworks](#application-frameworks)
- [Observability Stack](#observability-stack)
- [Testing & Benchmarking](#testing--benchmarking)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Development Tools](#development-tools)
- [Libraries & Dependencies](#libraries--dependencies)

---

## Application Frameworks

### Spring Boot 4.0.1

**Official Site**: [https://spring.io/projects/spring-boot](https://spring.io/projects/spring-boot)

**Why We Use It**:
- Industry standard for enterprise Java applications
- Extensive ecosystem and community support
- Multiple deployment modes (embedded Tomcat/Netty, standalone)
- Excellent integration with observability tools

**Implementation Details**:
- **Spring Boot 4.0.1** (latest major release)
- **Spring WebFlux** for reactive implementation
- **Spring MVC** for traditional servlet-based implementations
- **Actuator** for health checks and metrics

**Thread Models Implemented**:
1. **Platform Threads** (Traditional)
   - Servlet container thread pool
   - Tomcat connector
   - Blocking I/O model

2. **Virtual Threads** (Project Loom)
   - Lightweight threads from Java 21+
   - Simplified async programming
   - Netty connector with virtual thread support

3. **Reactive** (WebFlux)
   - Non-blocking I/O
   - Reactor framework
   - Event-loop architecture

**Configuration**:
```yaml
server:
  port: 8080
  
spring:
  application:
    name: spring-benchmark
    
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus
```

**Pros**:
- Mature, stable, well-documented
- Familiar to most Java developers
- Rich feature set
- Strong enterprise adoption

**Cons**:
- Higher memory footprint
- Slower startup compared to Quarkus
- More complex configuration for optimal performance

### Quarkus 3.30.6

**Official Site**: [https://quarkus.io/](https://quarkus.io/)

**Why We Use It**:
- Kubernetes-native architecture
- Optimized for cloud deployment
- Fast startup and low memory usage
- Native compilation support

**Implementation Details**:
- **Quarkus 3.30.6** (latest stable)
- **RESTEasy Reactive** for REST endpoints
- **SmallRye** for reactive programming
- **GraalVM** for native compilation

**Thread Models Implemented**:
1. **Platform Threads**
   - Traditional blocking I/O
   - Worker thread pool

2. **Virtual Threads**
   - Java 21+ virtual threads
   - Seamless async operations

3. **Reactive** (Mutiny)
   - Non-blocking reactive streams
   - SmallRye Mutiny API
   - Event-loop based

**Configuration**:
```properties
quarkus.application.name=quarkus-benchmark
quarkus.http.port=8090
quarkus.log.level=INFO
```

**Native Compilation**:
```bash
# Build native image
mvn package -Pnative

# Size comparison
# JVM JAR: ~200MB
# Native binary: ~50MB
```

**Pros**:
- Ultra-fast startup (milliseconds)
- Low memory footprint
- Excellent throughput
- Native image support

**Cons**:
- Smaller ecosystem than Spring
- Native build complexity
- Reflection limitations in native mode

### Go with Fiber (Work in Progress)

**Official Site**: [https://gofiber.io/](https://gofiber.io/)

**Why We're Adding It**:
- Excellent performance characteristics
- Built-in concurrency (goroutines)
- Fast HTTP routing
- Cross-language comparison

**Implementation Status**: 🚧 In Progress

**Initial Results**: ~120,000 RPS (preliminary)

---

## Observability Stack

### Grafana

**Official Site**: [https://grafana.com/](https://grafana.com/)

**Purpose**: Unified visualization and observability platform

**Features Used**:
- Dashboard provisioning
- Multiple data sources
- Explore interface
- Alerting (planned)

**Data Sources Configured**:
- Prometheus/Mimir (metrics)
- Loki (logs)
- Tempo (traces)
- Pyroscope (profiles)

**Dashboards**:
- Service overview
- JVM metrics
- HTTP metrics
- Custom queries

**Access**: [http://localhost:3000](http://localhost:3000)

### Loki

**Official Site**: [https://grafana.com/oss/loki/](https://grafana.com/oss/loki/)

**Purpose**: Log aggregation system

**Why Loki**:
- Label-based indexing (like Prometheus)
- Cost-effective storage
- Native Grafana integration
- LogQL query language

**Configuration Highlights**:
```yaml
ingester:
  chunk_idle_period: 5m
  max_chunk_age: 1h
  
limits_config:
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
```

**Query Examples**:
```logql
# All logs from service
{service_name="spring-jvm-virtual"}

# Error logs only
{service_name="quarkus-jvm-reactive"} |= "ERROR"

# Request duration parsing
{service_name="spring-jvm-virtual"} | json | duration > 100ms
```

### Tempo

**Official Site**: [https://grafana.com/oss/tempo/](https://grafana.com/oss/tempo/)

**Purpose**: Distributed tracing backend

**Why Tempo**:
- Trace ID-based storage (no indexing required)
- Cost-effective
- TraceQL query language
- Exemplar support

**Features**:
- Trace ingestion via OTLP
- Tag-based search
- Service graph generation
- Metrics generation from traces

**Query Examples**:
```traceql
# Find slow requests
{ duration > 100ms }

# Specific service spans
{ service.name = "spring-jvm-virtual" }

# Error traces
{ status = error }
```

### Mimir

**Official Site**: [https://grafana.com/oss/mimir/](https://grafana.com/oss/mimir/)

**Purpose**: Long-term metrics storage (Prometheus-compatible)

**Why Mimir**:
- Horizontally scalable
- High availability
- Long-term storage
- PromQL compatible

**Metrics Collected**:
- HTTP request rate
- Request duration (histogram)
- JVM memory usage
- GC statistics
- Thread counts
- CPU usage

**Query Examples**:
```promql
# Request rate
rate(http_server_requests_seconds_count[5m])

# P99 latency
histogram_quantile(0.99, http_server_requests_seconds_bucket)

# Heap usage
jvm_memory_used_bytes{area="heap"}
```

### Pyroscope

**Official Site**: [https://grafana.com/oss/pyroscope/](https://grafana.com/oss/pyroscope/)

**Purpose**: Continuous profiling

**Why Pyroscope**:
- Low overhead profiling
- Flame graph visualization
- Time-based analysis
- Tag-based filtering

**Profiling Methods**:

1. **Java Agent** (JVM only)
   ```bash
   -javaagent:/opt/pyroscope-agent.jar
   ```
   - CPU profiling
   - Allocation profiling
   - Lock contention

2. **eBPF** (All services)
   - System-level profiling
   - No instrumentation required
   - Minimal overhead

3. **HTTP Scrape** (Pull model)
   - Endpoint-based collection
   - Flexible integration

**Profile Types**:
- CPU: Where time is spent
- Allocations: Memory allocation patterns
- Locks: Contention analysis

### Grafana Alloy

**Official Site**: [https://grafana.com/oss/alloy/](https://grafana.com/oss/alloy/)

**Purpose**: OpenTelemetry collector and distributor

**Why Alloy**:
- Unified telemetry collection
- Service discovery
- eBPF profiling support
- Efficient batching

**Components Used**:
- OTLP receiver (gRPC + HTTP)
- Batch processor
- OTLP exporters (to Loki, Tempo, Mimir)
- Pyroscope exporter

**Data Flow**:
```
Services → Alloy → {Loki, Tempo, Mimir, Pyroscope}
```

---

## Testing & Benchmarking

### wrk2

**Official Site**: [https://github.com/giltene/wrk2](https://github.com/giltene/wrk2)

**Purpose**: HTTP benchmarking with constant throughput

**Why wrk2 (vs. wrk, ab, etc.)**:
- Constant request rate (not open-loop)
- Coordinated omission correction
- Accurate latency measurements
- Lua scripting support

**Key Features**:
- Multi-threaded load generation
- Connection pooling
- Latency distribution (HDR histogram)
- Custom request scripting

**Typical Usage**:
```bash
wrk2 -t 8 -c 200 -d 180s -R 80000 --latency http://service:8080/api/cache/key1
```

**Output Metrics**:
- Requests per second (actual)
- Latency distribution (p50, p90, p99, p99.9, p99.99)
- Transfer rate
- Error rate

**Comparison to Alternatives**:

| Tool | Type | Coordinated Omission | Scripting |
|------|------|---------------------|-----------|
| wrk2 | ✅ Fixed rate | ✅ Yes | ✅ Lua |
| wrk | ❌ Open loop | ❌ No | ✅ Lua |
| ab | ❌ Open loop | ❌ No | ❌ No |
| Gatling | ✅ Fixed rate | ✅ Yes | ✅ Scala |

### OpenTelemetry

**Official Site**: [https://opentelemetry.io/](https://opentelemetry.io/)

**Purpose**: Standardized telemetry instrumentation

**Why OpenTelemetry**:
- Vendor-neutral standard
- Auto-instrumentation
- Language-agnostic
- Future-proof

**Components**:
1. **SDK**: Embedded in services
2. **API**: Instrumentation interface
3. **Collector**: Data pipeline (Alloy)
4. **Protocol**: OTLP over gRPC

**Instrumentation Methods**:

**Java Agent** (JVM):
```bash
-javaagent:/opt/opentelemetry-javaagent.jar
```

**Native Dependency** (GraalVM):
```xml
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-api</artifactId>
</dependency>
```

**Signals Collected**:
- **Traces**: Request spans with context
- **Metrics**: Counters, gauges, histograms
- **Logs**: Structured logging with trace context

---

## Infrastructure & Deployment

### Docker

**Official Site**: [https://www.docker.com/](https://www.docker.com/)

**Purpose**: Containerization platform

**Why Docker**:
- Consistent environments
- Resource isolation
- Easy deployment
- Reproducible builds

**Images Used**:
- **gcr.io/distroless/java25-debian13:nonroot**: JVM Runtime Base
- **container-registry.oracle.com/graalvm/native-image:25**: Native builds
- **grafana/grafana**: Visualization
- **grafana/loki**: Logs
- **grafana/tempo**: Traces
- **grafana/mimir**: Metrics
- **grafana/pyroscope**: Profiles
- **grafana/alloy**: Collector

**Multi-stage Builds**:
```dockerfile
# Stage 1: Build
FROM maven:3.9.12-eclipse-temurin-25-noble AS builder
COPY . .
RUN mvn clean package

# Stage 2: Runtime
FROM gcr.io/distroless/java25-debian13:nonroot
COPY --from=builder /target/app.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### Docker Compose

**Official Site**: [https://docs.docker.com/compose/](https://docs.docker.com/compose/)

**Purpose**: Multi-container orchestration

**Why Docker Compose**:
- Declarative configuration
- Easy local development
- Service dependencies
- Network management

**Compose Features Used**:
- Profiles (OBS, SERVICES, RAIN_FIRE)
- Environment variables
- Volume management
- Network isolation
- Resource limits

**Example**:
```yaml
services:
  spring-jvm-virtual:
    build: ./services/spring/jvm/virtual
    profiles: [SERVICES]
    environment:
      - JAVA_OPTS=-Xmx1g
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 2G
```

---

## Development Tools

### Maven

**Official Site**: [https://maven.apache.org/](https://maven.apache.org/)

**Purpose**: Build automation and dependency management

**Why Maven**:
- Standard Java build tool
- Dependency resolution
- Plugin ecosystem
- Multi-module support

**Key Plugins**:
- `spring-boot-maven-plugin`: Executable JAR
- `quarkus-maven-plugin`: Native builds
- `native-maven-plugin`: GraalVM compilation

### GraalVM

**Official Site**: [https://www.graalvm.org/](https://www.graalvm.org/)

**Purpose**: High-performance JDK and native compilation

**Why GraalVM**:
- Native image compilation
- Faster startup
- Lower memory footprint
- Ahead-of-time compilation

**Editions**:
- **Community**: Free, basic features
- **Enterprise**: G1 GC, better performance

**Native Image**:
```bash
native-image \
  -H:+StaticExecutableWithDynamicLibC \
  -H:+ReportExceptionStackTraces \
  -O3 \
  -jar application.jar
```

### Git

**Official Site**: [https://git-scm.com/](https://git-scm.com/)

**Purpose**: Version control

**Workflow**:
- Branching strategy
- Commit conventions
- Pull request process

---

## Libraries & Dependencies

### Caffeine Cache

**Official Site**: [https://github.com/ben-manes/caffeine](https://github.com/ben-manes/caffeine)

**Purpose**: High-performance Java caching library

**Why Caffeine**:
- Non-blocking operations
- High throughput
- Low latency
- Window TinyLFU eviction

**Configuration**:
```java
Cache<String, String> cache = Caffeine.newBuilder()
    .maximumSize(10000)
    .build();
```

### Reactor (Spring)

**Official Site**: [https://projectreactor.io/](https://projectreactor.io/)

**Purpose**: Reactive programming library

**Features**:
- Non-blocking streams
- Backpressure support
- Scheduler abstraction

### Mutiny (Quarkus)

**Official Site**: [https://smallrye.io/smallrye-mutiny/](https://smallrye.io/smallrye-mutiny/)

**Purpose**: Reactive programming for Quarkus

**Features**:
- Simple API
- Uni and Multi types
- Excellent Quarkus integration

---

## Technology Stack Summary

| Category               | Technology                       | Version   | Purpose / Role                            |
|------------------------|----------------------------------|-----------|-------------------------------------------|
| **Runtime**            | Java (Eclipse Temurin)           | 25        | JVM runtime for backend services          |
| **Runtime**            | GraalVM                          | 25.0.1    | Native image compilation                  |
| **Runtime**            | Go                               | 1.25.5    | High-performance Go services              |
| **Runtime**            | Node.js                          | 25.2.1    | JavaScript runtime for frontend tooling   |
| **Framework**          | Spring Boot                      | 4.0.1     | Enterprise Java framework                 |
| **Framework**          | Quarkus                          | 3.30.6    | Cloud-native Java framework               |
| **Framework**          | React                            | 19.2.3    | UI rendering layer                        |
| **Framework**          | Next.js                          | 16.1.3    | Frontend application framework (SSR)      |
| **Framework**          | TypeScript                       | 5.9.3     | Type-safe frontend development            |
| **Library**            | Material UI (MUI)                | 7.3.7     | Component library and theming             |
| **Observability**      | Grafana                          | 12.3.1    | Dashboards and visualization              |
| **Observability**      | Loki                             | 3.6.3     | Log aggregation                           |
| **Observability**      | Tempo                            | 2.9.0     | Distributed tracing                       |
| **Observability**      | Mimir                            | 3.0.2     | Long-term metrics storage                 |
| **Observability**      | Pyroscope                        | 1.18.0    | Continuous profiling                      |
| **Observability**      | Grafana Alloy                    | 1.10.2    | Telemetry collection and pipelines        |
| **Instrumentation**    | OpenTelemetry SDK                | 1.57.0    | Metrics, traces, and logs instrumentation |
| **Instrumentation**    | OpenTelemetry Distribution       | 2.23.0    | Auto-instrumentation and exporters        |
| **Cache**              | Caffeine                         | 3.2.3     | High-performance in-memory caching        |
| **Container**          | Docker Engine                    | 24+       | Container runtime                         |
| **Orchestration**      | Docker Compose                   | v2        | Multi-container orchestration             |
| **Orchestration**      | Docker CLI                       | 29.1.3    | Image build and lifecycle management      |
| **Build**              | Maven                            | 3.9.12    | Java build and dependency management      |
| **Build**              | npm                              | 11.6.2    | Frontend package management               |
| **Testing / Load**     | wrk2                             | Latest    | HTTP benchmarking and load testing        |
| **Testing**            | Vitest                           | 4.0.17    | Frontend unit testing                     |
| **Testing**            | JUnit                            | 5 / 6     | JVM unit and integration testing          |

---

## Further Reading

### Official Documentation
- [Spring Boot Reference](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Quarkus Guides](https://quarkus.io/guides/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Docker Documentation](https://docs.docker.com/)

### Community Resources
- [Spring Blog](https://spring.io/blog)
- [Quarkus Blog](https://quarkus.io/blog/)
- [Grafana Blog](https://grafana.com/blog/)
- [CNCF Projects](https://www.cncf.io/projects/)

### Learning Paths
- [Grafana Fundamentals](https://grafana.com/tutorials/grafana-fundamentals/)
- [OpenTelemetry Bootcamp](https://opentelemetry.io/docs/demo/)
- [Docker Getting Started](https://docs.docker.com/get-started/)

---

**Next**: [Getting Started Guide](getting-started.html) | [Architecture](architecture.html) | [Benchmarking](benchmarking.html)
