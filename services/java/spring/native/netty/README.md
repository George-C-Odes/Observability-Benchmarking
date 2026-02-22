# Spring Boot Netty Native Service

## Overview
A reactive REST service implementation built with Spring Boot 4.0.3 compiled to a native executable using GraalVM Native Image. This service uses Spring WebFlux with Netty for reactive, non-blocking request handling with fast startup and low memory footprint.

## Purpose
- Demonstrate Spring Boot native compilation with reactive WebFlux
- Achieve fast startup times (<1 second) with reactive architecture
- Compare native vs JVM execution for Spring WebFlux applications
- Provide observability in a native-compiled reactive service

## Service Details

### Framework & Runtime
- **Framework**: Spring Boot 4.0.3 + Spring WebFlux
- **Web Server**: Netty (event-loop based)
- **Compiler**: GraalVM Native Image (Enterprise or Community)
- **Base Java**: 25.0.2
- **Concurrency Model**: Reactive (Project Reactor)

### Endpoints

#### `GET /hello/reactive`
Handles requests using reactive programming model with Mono.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds (not recommended)
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Boot reactive REST {value}"`

**Thread Info**: `reactor-http-nio-...` (Netty event loop threads)

## Configuration Options

### Build-Time Configuration

#### Native Image Build Arguments (via Spring Native plugin)
```bash
# Maven profile
-Pnative

# Build configuration
native:compile
-Dmaven.artifact.threads=16
-Dmaven.compiler.release=25

# GraalVM options are managed by Spring Native plugin
```

Spring Native automatically configures:
- Required reflection metadata
- Resource includes
- Proxy configuration
- JNI configuration

### Runtime Configuration

#### Environment Variables

| Variable                      | Description                      | Default/Configured    |
|-------------------------------|----------------------------------|-----------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317`          |
| `OTEL_SERVICE_NAME`           | Service name for telemetry       | `SpringNativeNetty`   |
| `SPRING_APPLICATION_NAME`     | Spring application name          | `spring-native-netty` |

#### Application Configuration
Same as JVM version - see `services/spring/jvm/netty/src/main/resources/application.yml`:
- Management endpoints
- Metrics configuration
- Logging patterns
- Tracing enabled

**Note**: Native image is built with configuration baked in at compile time.

## Observability Metrics

### Custom Application Metrics

#### `hello.request.count` (Counter)
Tracks request count for the reactive endpoint.

**Tags**:
- `endpoint`: `/hello/reactive`

### Standard Metrics
Similar to JVM version but with native-specific characteristics:
- HTTP server metrics
- Memory metrics (native memory model)
- Thread metrics (fewer threads in native)
- Process metrics

### Observability Integration

#### Metrics Export
- **Protocol**: OTLP (native implementation, not Java agent)
- **Endpoint**: Configured via environment variable
- **Note**: No OpenTelemetry Java agent in native (AOT compiled)

#### Distributed Tracing
- **Implementation**: Native Spring Boot tracing (not OTEL agent)
- **Propagation**: W3C Trace Context
- **Limitations**: Reduced instrumentation compared to JVM + agent

#### Logging
- **Format**: Includes trace ID and span ID
- **Export**: Via console output to Docker logs

#### Profiling
- **JFR**: Not available (native doesn't support JFR)
- **Pyroscope Java Agent**: Not available (JVM agent only)
- **eBPF Profiling**: Supported via Alloy/Pyroscope eBPF collector
- **Native Profilers**: Can use perf, async-profiler in native mode

### Metrics Compatibility
⚠️ **Limited metrics** compared to JVM:
- No OpenTelemetry Java agent automatic instrumentation
- Spring Boot native metrics support is evolving
- Some Micrometer integrations may not work in native

## Architecture

### Native Compilation Benefits
- **Fast Startup**: <1 second (vs 3-4s for JVM)
- **Low Memory**: ~200-300 MB total (vs 400+ MB for JVM)
- **Small Image**: ~150-200 MB (vs 400+ MB for JVM)
- **Instant Performance**: No JIT warmup needed

### Native Compilation Trade-offs
- **Build Time**: 5-10 minutes (vs seconds for JVM)
- **Build Memory**: Requires significant memory for compilation
- **Limited Reflection**: Requires AOT configuration
- **Reduced Observability**: No Java agent support
- **Spring Boot 4.0 + Native**: Still maturing, some features may not work

### Cache Implementation
Same as JVM version:
- **Library**: Caffeine cache
- **Size**: 50,000 entries
- **Pre-population**: At startup

### Reactive Model
Same as JVM version:
- Project Reactor Mono/Flux
- Netty event loops
- Non-blocking I/O

## Performance Characteristics

### Benchmark Results
⚠️ **TBA** - Spring Native benchmarks are not yet complete in the main results table.

### Expected Performance
- **Throughput**: Likely lower than JVM (no JIT optimization)
- **Startup**: Significantly faster (<1s vs 3-4s)
- **Memory**: Much lower footprint
- **Latency**: More consistent (no JIT compilation spikes)

### Use Cases
Native is best for:
- Serverless/FaaS (fast cold starts)
- Microservices (lower memory, higher density)
- CLI tools (instant startup)
- Resource-constrained environments

Native may not be best for:
- Long-running services with steady load (JIT can optimize better)
- Services requiring extensive reflection/dynamic behavior
- Maximum throughput scenarios

### Resource Usage
- **Heap Memory**: Configured at build time
- **RSS**: ~200-300 MB typical
- **Startup Time**: <1 second
- **Container Size**: ~150-200 MB

## Building and Running

### Prerequisites
- GraalVM Native Image 25.0.2+ (Enterprise or Community)
- Maven 3.9+
- Docker (for containerized build recommended)
- 16GB+ RAM (for native compilation)

### Native Build (Local)
```bash
cd services/spring/native/netty

# Install dependencies
../mvnw dependency:go-offline

# Build native executable
../mvnw -Pnative native:compile
```

### Docker Build (Recommended)
```bash
cd services/spring
docker build -f native/Dockerfile \
  --build-arg PROFILE=netty \
  -t spring-native-netty:latest .
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_NATIVE_NETTY=SERVICES \
  up spring-native-netty -d
```

### Runtime Execution
```bash
# Direct execution
./target/spring-native-netty

# Runs immediately, no JVM startup delay
```

## Build Configuration

### Dockerfile Highlights
```dockerfile
# Builder stage - GraalVM Native Image
FROM container-registry.oracle.com/graalvm/native-image:25.0.2-ol9

# Copy source from JVM build directory
COPY jvm/netty/src ./netty/src
COPY native/netty/pom.xml ./netty/pom.xml

# Build native executable
RUN ./mvnw -B -Pnative native:compile

# Runtime stage - Minimal Debian
FROM debian:13.2-slim
COPY --from=builder /workspace/target/spring-native-netty /native/
```

### POM Configuration
The native `pom.xml` includes:
- Spring Native plugin (org.graalvm.buildtools:native-maven-plugin)
- Native profile activation
- Build-time native image configuration
- Dependencies must be native-compatible

## Testing

### Health Checks
```bash
# Health endpoint
curl http://localhost:8080/actuator/health
```

### Endpoint Testing
```bash
# Reactive endpoint
curl "http://localhost:8080/hello/reactive"

# With logging
curl "http://localhost:8080/hello/reactive?log=true"
```

### Startup Time Verification
```bash
# Check container logs for startup time
docker logs spring-native-netty 2>&1 | grep "Started"

# Expected: Started in < 1 second
```

## Monitoring in Grafana

### Key Metrics
Same queries as JVM version, filtered by service name:
```promql
# RPS
rate(hello_request_count_total{service_name="SpringNativeNetty"}[1m])

# Memory (RSS)
process_memory_rss_bytes{service_name="SpringNativeNetty"}
```

## Spring Native Considerations

### What Works Well
- ✅ Spring WebFlux / Netty
- ✅ Spring Boot Actuator (basic features)
- ✅ Configuration properties
- ✅ Dependency injection
- ✅ Basic HTTP endpoints
- ✅ Reactive programming

### Potential Limitations
- ⚠️ Some Micrometer integrations
- ⚠️ Advanced OTEL features (no agent)
- ⚠️ Dynamic proxy generation
- ⚠️ CGLIB proxies
- ⚠️ Some AOP features
- ⚠️ Runtime reflection

### Spring Boot 4.0 + Native Status
⚠️ **Early Adoption**: Spring Boot 4.0 is very new and native support is still maturing:
- Some features may not work as expected
- Documentation is evolving
- Community support is growing
- Best to test thoroughly

## Troubleshooting

### Build Failures
- **Out of Memory**: Increase Docker memory or build machine RAM
- **Missing Metadata**: Add to `reflect-config.json` or use hints
- **Classpath Scanning Issues**: Explicitly register components

### Runtime Issues
- **Missing Classes**: Add to native-image configuration
- **Reflection Errors**: Register in Spring Native hints
- **Resource Not Found**: Include resources in build configuration

### Performance Issues
- Native doesn't benefit from JIT optimization
- Ensure all code paths are exercised during build (PGO could help)
- Consider if native is appropriate for your use case

## Dependencies

### Build Dependencies
- GraalVM Native Image compiler
- Spring Native plugin
- All JVM dependencies (compile-time)

### Runtime Dependencies
- Minimal Linux base
- No JVM required
- Native executable is self-contained

## GraalVM Editions

### Enterprise vs Community

| Feature       | Enterprise | Community    |
|---------------|------------|--------------|
| Performance   | Better     | Good         |
| Build Time    | Faster     | Slower       |
| Optimizations | Advanced   | Standard     |
| Support       | Commercial | Community    |
| License       | Oracle     | GPL v2 + CPE |

The repository defaults to Enterprise for consistency.

## Known Issues

### Spring Boot 4.0 Compatibility
- New framework version, native support still stabilizing
- Some integrations may not work

### Metrics Limitations
- Fewer automatic metrics than JVM + OTEL agent
- Manual instrumentation may be needed

### No Java Agent Support
- OpenTelemetry agent can't be used
- Pyroscope agent can't be used
- Limited automatic instrumentation

## Future Enhancements
- [ ] Complete benchmark results for native Netty
- [ ] Optimize native build configuration
- [ ] Improve metrics coverage
- [ ] Add PGO (Profile-Guided Optimization)
- [ ] Document Spring Native hints needed

## Contributing
When modifying this service:
1. Test native compilation (requires resources)
2. Verify reactive patterns work in native
3. Check if new dependencies support native
4. Update reflection/proxy configuration if needed
5. Document native-specific issues

## References
- [Spring Native Documentation](https://docs.spring.io/spring-boot/docs/current/reference/html/native-image.html)
- [GraalVM Native Image](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)
- [Native Build Tools](https://graalvm.github.io/native-build-tools/)
