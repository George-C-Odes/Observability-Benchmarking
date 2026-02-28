---
layout: default
title: Tools & Technologies
permalink: /docs/tools-technologies
---

# Tools & Technologies

A comprehensive overview of the tools, frameworks, and technologies used in this project.

> Terminology note: **concurrency** describes how a runtime handles many in-flight tasks (virtual threads/reactive/goroutines). **parallelism** describes work happening simultaneously across CPU cores.

## Table of Contents
- [Application Frameworks](#application-frameworks)
- [Observability Stack](#observability-stack)
- [Testing & Benchmarking](#testing--benchmarking)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Development Tools](#development-tools)
- [Libraries & Dependencies](#libraries--dependencies)

---

## Application Frameworks

### Spring Boot 4.0.3

**Official Site**: [https://spring.io/projects/spring-boot](https://spring.io/projects/spring-boot)

**Why We Use It**:
- Industry standard for enterprise Java applications
- Extensive ecosystem and community support
- Multiple deployment modes (embedded Tomcat/Netty, standalone)
- Excellent integration with observability tools

**Implementation Details**:
- **Spring Boot 4.0.3** (latest major release)
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

### Quarkus 3.32.1

**Official Site**: [https://quarkus.io/](https://quarkus.io/)

**Why We Use It**:
- Kubernetes-native architecture
- Optimized for cloud deployment
- Fast startup and low memory usage
- Native compilation support

**Implementation Details**:
- **Quarkus 3.32.1** (latest stable)
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
quarkus.http.port=8080
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

### Go with Fiber

**Official Site**: [https://gofiber.io/](https://gofiber.io/)

**Why We're Adding It**:
- Excellent performance characteristics
- Built-in concurrency (goroutines)
- Fast HTTP routing
- Cross-language comparison
- Ultralightweight

**Headline benchmark (17/02/2026)**: ~24,000 RPS (observability-aligned implementation)

**Fairness note**: An additional `go-simple` variant can reach ~60,000 RPS, but it is excluded from headline comparisons because it does not use an equivalent observability setup to the Java services.

### SparkJava 3.0.3 (Zoomba fork)

**Official Site**: [https://sparkjava.com/](https://sparkjava.com/) | [Zoomba fork](https://github.com/nicholaszoomba/spark)

**Why We Use It**:
- Extremely minimal HTTP micro-framework — ideal as a lightweight baseline
- Simple, expressive API for defining routes
- The Zoomba fork adds virtual thread support to the original Spark codebase
- Useful for isolating framework overhead in benchmarks

**Implementation Details**:
- **SparkJava 3.0.3** (Zoomba fork with virtual thread support)
- Embedded Jetty server
- JVM builds only (no native image support)

**Thread Models Implemented**:
1. **Platform Threads**
   - Traditional Jetty thread pool
   - Blocking I/O model

2. **Virtual Threads** (via Zoomba fork)
   - Lightweight threads from Java 21+
   - Drop-in replacement for the platform thread executor

**Pros**:
- Near-zero learning curve
- Very small dependency footprint
- Fast startup
- Great for micro-benchmarks and prototyping

**Cons**:
- No reactive/non-blocking mode
- Limited ecosystem (no built-in DI, validation, etc.)
- No native image support
- Official project is largely unmaintained; the Zoomba fork keeps it viable

### Javalin 7.0.0

**Official Site**: [https://javalin.io/](https://javalin.io/)

**Why We Use It**:
- Lightweight yet feature-rich REST framework built on top of Jetty
- First-class Kotlin support (useful for future polyglot benchmarks)
- Simple, declarative API similar to Express.js / Koa
- Good middle ground between Spark's minimalism and Spring's richness

**Implementation Details**:
- **Javalin 7.0.0** (latest major release)
- Embedded Jetty server
- JVM builds only (no native image support)

**Thread Models Implemented**:
1. **Platform Threads**
   - Standard Jetty thread pool
   - Blocking I/O model

2. **Virtual Threads**
   - Java 21+ virtual threads via Jetty's virtual thread executor
   - Blocking code on virtual threads

**Pros**:
- Concise, readable API
- Lightweight with fast startup
- Active community and regular releases
- Built-in OpenAPI / Swagger support

**Cons**:
- No reactive/non-blocking HTTP model
- No native image support out of the box
- Smaller ecosystem than Spring or Micronaut

### Micronaut 4.10.16

**Official Site**: [https://micronaut.io/](https://micronaut.io/)

**Why We Use It**:
- Compile-time dependency injection and AOP — avoids reflection-heavy runtime costs
- Fast startup and low memory footprint, rivaling Quarkus
- First-class GraalVM native image support
- Provides all three concurrency modes for a well-rounded comparison

**Implementation Details**:
- **Micronaut 4.10.16** (latest stable)
- **Micronaut HTTP Server** (Netty-based)
- **GraalVM** for native compilation
- Experimental `micronaut.server.netty.worker.threads` carrier-thread property for loom integration

**Thread Models Implemented**:
1. **Platform Threads**
   - Traditional Netty worker pool with blocking dispatch
   - Standard thread-per-request model

2. **Virtual Threads**
   - Java 21+ virtual threads with Netty carrier threads
   - Combines Netty's event loop with virtual-thread blocking

3. **Reactive**
   - Netty event-loop architecture
   - Reactor / RxJava integration
   - Non-blocking I/O with backpressure

**Native Compilation**:
```bash
# Build native image
./mvnw package -Dpackaging=native-image
```

**Pros**:
- Compile-time DI eliminates reflection overhead
- Fast startup (sub-second JVM, near-instant native)
- Excellent GraalVM support
- Rich feature set (HTTP client, service discovery, config management)

**Cons**:
- Smaller community than Spring
- Compile-time DI can be harder to debug
- Some libraries require Micronaut-specific adapters

### Helidon 4.3.4

**Official Site**: [https://helidon.io/](https://helidon.io/)

**Why We Use It**:
- Oracle's open-source microservices framework, purpose-built for Java 21+ virtual threads
- Two distinct flavours (SE and MP) let us benchmark minimal vs full-stack overhead
- Excellent native image support via GraalVM
- `jlink`-optimised JVM builds produce notably small Docker images

**Implementation Details**:
- **Helidon 4.3.4** (latest stable, virtual-thread–first architecture)
- **Helidon SE**: Programmatic, functional-style routing with minimal overhead (Níma)
- **Helidon MP**: MicroProfile-compliant layer on top of SE (CDI + JAX-RS)
- Both flavours support JVM and GraalVM native builds

**Thread Model**:
- **Virtual Threads only** — Helidon 4 removed the legacy reactive Netty-based HTTP server; every request is dispatched on a virtual thread by default. Platform-thread and reactive modes are N/A by design.

**Helidon SE vs Helidon MP**:

| Aspect      | Helidon SE                         | Helidon MP                            |
|-------------|------------------------------------|---------------------------------------|
| Routing     | Programmatic / functional          | CDI + JAX-RS annotations              |
| Overhead    | Minimal                            | MicroProfile CDI container overhead   |
| Best for    | Maximum throughput, tiny footprint | Standards compliance, enterprise APIs |
| Typical RPS | ~66k (JVM), ~31k (native)          | ~15k (JVM), ~10k (native)             |

**Build Highlights**:
- **jlink-optimised JVM images**: Custom JRE with unused JDK modules stripped, yielding Docker images as small as ~169 MB (SE) / ~189 MB (MP)
- **Shared native sources**: Native modules reuse JVM sources via `build-helper-maven-plugin`; only the build toolchain differs

**Pros**:
- Best-in-class virtual thread performance (SE variant)
- Very small Docker images thanks to jlink
- Clean separation between SE (minimal) and MP (full-stack)
- Strong GraalVM native support

**Cons**:
- Virtual-thread–only model limits concurrency model comparisons
- Smaller community and ecosystem than Spring or Quarkus
- Helidon MP's CDI overhead is significant compared to SE

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
wrk2 -t 8 -c 200 -d 180s -R 80000 --latency http://service:8080/hello/platform
```

**Output Metrics**:
- Requests per second (actual)
- Latency distribution (p50, p90, p99, p99.9, p99.99)
- Transfer rate
- Error rate

**Comparison to Alternatives**:

| Tool    | Type         | Coordinated Omission | Scripting |
|---------|--------------|----------------------|-----------|
| wrk2    | ✅ Fixed rate | ✅ Yes                | ✅ Lua     |
| wrk     | ❌ Open loop  | ❌ No                 | ✅ Lua     |
| ab      | ❌ Open loop  | ❌ No                 | ❌ No      |
| Gatling | ✅ Fixed rate | ✅ Yes                | ✅ Scala   |

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

### Quality guards (linting / static analysis)

This repository treats code quality tooling as a first-class part of “production readiness”:

- **ESLint**: Used in the Next.js dashboard (`utils/nextjs-dash`).
- **Checkstyle**: Enforces consistent style across Java services.
- **Qodana**: Automated static analysis via GitHub Actions (see `qodana.yaml`).

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
   .maximumSize(50000)
   .expireAfterWrite(Duration.ofDays(1))
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

| Layer             | Category           | Technology                 | Version | Purpose / Role                                                       |
|-------------------|--------------------|----------------------------|---------|----------------------------------------------------------------------|
| **Execution**     | Runtime            | Java (Eclipse Temurin)     | 25.0.2  | Primary JVM runtime for backend services under benchmark             |
| **Execution**     | Runtime            | GraalVM                    | 25.0.2  | Native image compilation for startup and memory footprint benchmarks |
| **Execution**     | Runtime            | Go                         | 1.26.0  | High-performance baseline services for comparison                    |
| **Execution**     | Runtime            | Node.js                    | 25.7.0  | Frontend tooling and SSR runtime                                     |
| **Backend**       | Framework          | Quarkus                    | 3.32.1  | Cloud-native Java framework (JVM + native image focus)               |
| **Backend**       | Framework          | Spring Boot                | 4.0.3   | Enterprise Java baseline framework                                   |
| **Backend**       | Framework          | SparkJava (Zoomba fork)    | 3.0.3   | Minimal HTTP server (virtual-thread friendly)                        |
| **Backend**       | Framework          | Javalin                    | 7.0.0   | Lightweight REST server                                              |
| **Backend**       | Framework          | Micronaut                  | 4.10.16 | Compile-time optimized JVM microservices framework                   |
| **Backend**       | Framework          | Helidon SE                 | 4.3.4   | Lightweight Java microservices (programmatic routing)                |
| **Backend**       | Framework          | Helidon MP                 | 4.3.4   | MicroProfile-compliant Java microservices (CDI + JAX-RS)             |
| **Frontend**      | Framework          | Next.js                    | 16.1.6  | SSR frontend and control dashboard                                   |
| **Frontend**      | Library            | React                      | 19.2.4  | UI rendering layer                                                   |
| **Frontend**      | Language           | TypeScript                 | 5.9.3   | Type-safe frontend development                                       |
| **Frontend**      | UI Library         | Material UI (MUI)          | 7.3.8   | Component library and theming                                        |
| **Observability** | Visualization      | Grafana                    | 12.4.0  | Metrics, logs, traces dashboards                                     |
| **Observability** | Logs               | Loki                       | 3.6.7   | Log aggregation                                                      |
| **Observability** | Tracing            | Tempo                      | 2.10.1  | Distributed tracing backend                                          |
| **Observability** | Metrics            | Mimir                      | 3.0.3   | Long-term metrics storage                                            |
| **Observability** | Profiling          | Pyroscope                  | 1.18.1  | Continuous CPU and memory profiling                                  |
| **Observability** | Collection         | Grafana Alloy              | 1.10.2  | Unified telemetry collection pipelines                               |
| **Telemetry**     | Instrumentation    | OpenTelemetry SDK          | 1.59.0  | Manual metrics, logs, and traces instrumentation                     |
| **Telemetry**     | Instrumentation    | OpenTelemetry Distribution | 2.25.0  | Auto-instrumentation and exporters                                   |
| **Performance**   | Cache              | Caffeine                   | 3.2.3   | High-performance in-memory caching                                   |
| **Platform**      | Container Runtime  | Docker Engine              | 24+     | Container runtime for reproducible benchmarks                        |
| **Platform**      | Orchestration      | Docker Compose             | v2      | Local multi-service orchestration                                    |
| **Platform**      | Tooling            | Docker CLI                 | 29.2.1  | Image build and lifecycle management                                 |
| **Build**         | Build Tool         | Maven                      | 3.9.12  | Java build and dependency management                                 |
| **Build**         | Package Manager    | npm                        | 11.10.1 | Frontend dependency management                                       |
| **Testing**       | Load Testing       | wrk2                       | Latest  | Deterministic HTTP benchmarking                                      |
| **Testing**       | Unit / Integration | JUnit                      | 5 / 6   | JVM unit and integration testing                                     |
| **Testing**       | Frontend Testing   | Vitest                     | 4.0.18  | Frontend unit testing                                                |

---

## Further Reading

### Official Documentation
- [Spring Boot Reference](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Quarkus Guides](https://quarkus.io/guides/)
- [SparkJava Documentation](https://sparkjava.com/documentation)
- [Javalin Documentation](https://javalin.io/documentation)
- [Micronaut Documentation](https://docs.micronaut.io/latest/guide/)
- [Helidon Documentation](https://helidon.io/docs/latest/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Docker Documentation](https://docs.docker.com/)

### Community Resources
- [Spring Blog](https://spring.io/blog)
- [Quarkus Blog](https://quarkus.io/blog/)
- [Micronaut Blog](https://micronaut.io/blog/)
- [Helidon Blog](https://medium.com/helidon)
- [Grafana Blog](https://grafana.com/blog/)
- [CNCF Projects](https://www.cncf.io/projects/)

### Learning Paths
- [Grafana Fundamentals](https://grafana.com/tutorials/grafana-fundamentals/)
- [OpenTelemetry Bootcamp](https://opentelemetry.io/docs/demo/)
- [Docker Getting Started](https://docs.docker.com/get-started/)

---

**Next**: [Getting Started](getting-started.html) | [Architecture](architecture.html) | [Benchmarking](benchmarking.html) | [Adding a Service](adding-a-service.html)
