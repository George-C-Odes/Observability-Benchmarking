# Spring Boot Tomcat Native Service

## Overview
A REST service implementation built with Spring Boot 4.0.2 compiled to a native executable using GraalVM Native Image. This service runs on embedded Tomcat and can be configured for either platform thread mode or virtual thread mode, offering fast startup times and low memory footprint.

## Purpose
- Demonstrate Spring Boot native compilation with traditional Spring Web (MVC)
- Compare native vs JVM execution for imperative Spring applications
- Achieve sub-second startup times with either platform or virtual threads
- Benchmark native performance across different thread models

## Service Details

### Framework & Runtime
- **Framework**: Spring Boot 4.0.2 + Spring Web MVC
- **Web Server**: Apache Tomcat (embedded)
- **Compiler**: GraalVM Native Image (Enterprise or Community)
- **Base Java**: 25.0.2
- **Thread Models**: Platform OR Virtual (single mode per build)

### Endpoints

#### `GET /hello/platform`
Handles requests using standard platform threads (Tomcat thread pool).

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Boot platform REST {value}"`

**Availability**: Only when built with `VIRTUAL_ENABLED=false`

#### `GET /hello/virtual`
Handles requests using Java virtual threads.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Boot virtual REST {value}"`

**Availability**: Only when built with `VIRTUAL_ENABLED=true`

## Configuration Options

### Build-Time Configuration

#### Docker Build Arguments
```bash
# Platform threads variant
docker build --build-arg PROFILE=tomcat --build-arg VIRTUAL_ENABLED=false

# Virtual threads variant
docker build --build-arg PROFILE=tomcat --build-arg VIRTUAL_ENABLED=true
```

The build process:
1. Selects Tomcat source code and pom.xml
2. Uses `yq` to set `spring.threads.virtual.enabled` in application.yml
3. Compiles to native with configuration baked in

#### Native Image Build Arguments (via Spring Native plugin)
```bash
-Pnative
native:compile
-Dmaven.artifact.threads=16
-Dmaven.compiler.release=25
```

Spring Native plugin handles:
- Reflection configuration
- Resource includes
- Proxy generation
- JNI configuration

### Runtime Configuration

#### Environment Variables

| Variable                      | Description                      | Default/Configured   |
|-------------------------------|----------------------------------|----------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317`         |
| `OTEL_SERVICE_NAME`           | Service name for telemetry       | `SpringNativeTomcat` |
| `SPRING_APPLICATION_NAME`     | Spring application name          | Set at build time    |

#### Application Configuration
Same as JVM version (baked in at compile time):
- Tomcat thread pool settings (max 500 threads, min spare 100)
- Connection limits (20,000 max connections)
- Health and metrics endpoints
- Virtual thread setting (determined at build time)

## Observability Metrics

### Custom Application Metrics

#### `hello.request.count` (Counter)
Tracks request count per endpoint.

**Tags**:
- `endpoint`: `/hello/platform` or `/hello/virtual`

### Standard Metrics
Similar to JVM version but with native-specific characteristics:
- HTTP server metrics (limited)
- Memory metrics (native memory model)
- Thread metrics
- Process metrics (RSS, VSS)
- Tomcat metrics (may be limited)

### Observability Integration

#### Metrics Export
- **Protocol**: OTLP (native implementation, not Java agent)
- **Endpoint**: Configured via environment variable
- **Note**: No OpenTelemetry Java agent in native (AOT compiled)

#### Distributed Tracing
- **Implementation**: Native Spring Boot tracing (not OTEL agent)
- **Propagation**: W3C Trace Context
- **Limitations**: Reduced automatic instrumentation vs JVM + agent

#### Logging
- **Format**: Includes trace ID and span ID
- **Export**: Via console output to Docker logs → Loki

#### Profiling
- **JFR**: Not available (standard native doesn't support JFR)
- **Pyroscope Java Agent**: Not available (JVM agent only)
- **eBPF Profiling**: Supported via Alloy/Pyroscope eBPF collector
- **Native Profilers**: Can use perf, async-profiler in native mode

### Metrics Compatibility
⚠️ **Limited metrics** compared to JVM:
- No OpenTelemetry Java agent automatic instrumentation
- Spring Boot native metrics support is still evolving
- Some Micrometer integrations may not work in native

## Architecture

### Native Compilation Benefits
- **Fast Startup**: ~0.5-1 second (vs 3-4s for JVM)
- **Low Memory**: ~200-300 MB total (vs 400+ MB for JVM)
- **Small Image**: ~150-200 MB (vs 400+ MB for JVM)
- **Instant Performance**: No JIT warmup needed
- **Higher Deployment Density**: More instances per host

### Native Compilation Trade-offs
- **Build Time**: 5-10 minutes (vs seconds for JVM)
- **Build Memory**: Requires significant memory (8GB+)
- **Limited Reflection**: Requires explicit configuration
- **Reduced Observability**: No Java agent support
- **Lower Throughput**: No JIT optimization over time
- **Spring Boot 4.0 + Native**: Still maturing

### Cache Implementation
Same as JVM version:
- **Library**: Caffeine cache
- **Size**: 50,000 entries
- **Pre-population**: At startup

### Thread Model Details

#### Platform Threads Mode (Native)
- **Build**: Set `VIRTUAL_ENABLED=false`
- **Thread Pool**: Tomcat's worker thread pool (compiled in)
- **Thread Naming**: `http-nio-8080-exec-N`
- **Characteristics**: Traditional thread-per-request

#### Virtual Threads Mode (Native)
- **Build**: Set `VIRTUAL_ENABLED=true`
- **Implementation**: Java 25 virtual threads in native
- **Thread Naming**: `VirtualThread[#N]`
- **Characteristics**: Lightweight threads in native binary

### Deployment Strategy
- **Two separate builds** required for platform vs virtual
- **Binary name includes mode**: `spring-native-tomcat-platform` or `spring-native-tomcat-virtual`
- **Mode set at build time**, not runtime

## Performance Characteristics

### Benchmark Results
⚠️ **TBA** - Spring Native Tomcat benchmarks are not yet complete in the main results table.

### Expected Performance
- **Platform**: Lower than JVM (no JIT), but fast startup
- **Virtual**: Better than platform for high concurrency, instant startup
- **Startup Time**: Sub-second for both modes
- **Memory**: Significantly lower than JVM
- **Latency**: More consistent (no JIT spikes)

### Use Cases for Native
Best for:
- Microservices with frequent scaling (fast startup)
- Serverless/FaaS (cold start optimization)
- Resource-constrained environments (lower memory)
- CLI tools and utilities

Consider JVM for:
- Long-running services (JIT optimization benefits)
- Maximum sustained throughput
- Complex reflection/dynamic behavior

### Resource Usage
- **Heap Memory**: Configured at build time
- **RSS**: ~200-300 MB typical
- **Startup Time**: 0.5-1 second
- **Container Size**: ~150-200 MB

## Building and Running

### Prerequisites
- GraalVM Native Image 25.0.2+ (Enterprise or Community)
- Maven 3.9+
- Docker (for containerized build recommended)
- 16GB+ RAM (for native compilation)
- yq tool (for YAML manipulation in build)

### Native Build (Local)
```bash
cd services/spring/native/tomcat

# Install dependencies
../mvnw dependency:go-offline

# Build native executable (platform threads)
../mvnw -Pnative native:compile

# Note: Virtual thread setting must be in application.yml before build
```

### Docker Build (Recommended)

#### Platform Threads
```bash
cd services/spring
docker build -f native/Dockerfile \
  --build-arg PROFILE=tomcat \
  --build-arg VIRTUAL_ENABLED=false \
  -t spring-native-tomcat-platform:latest .
```

#### Virtual Threads
```bash
cd services/spring
docker build -f native/Dockerfile \
  --build-arg PROFILE=tomcat \
  --build-arg VIRTUAL_ENABLED=true \
  -t spring-native-tomcat-virtual:latest .
```

### Docker Compose

#### Platform Threads
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_NATIVE_TOMCAT_PLATFORM=SERVICES \
  up spring-native-tomcat-platform -d
```

#### Virtual Threads
```bash
docker compose --project-directory compose \
  --profile=OBS \
  -e DOCKER_PROF_SPRING_NATIVE_TOMCAT_VIRTUAL=SERVICES \
  up spring-native-tomcat-virtual -d
```

### Runtime Execution
```bash
# Platform threads binary
./target/spring-native-tomcat-platform

# Virtual threads binary
./target/spring-native-tomcat-virtual

# Starts immediately, no JVM warmup
```

## Build Configuration

### Dockerfile Highlights
```dockerfile
# Builder stage - GraalVM Native Image
FROM container-registry.oracle.com/graalvm/native-image:25.0.2-ol9

# Install yq for YAML manipulation
RUN curl -L "https://github.com/mikefarah/yq/releases/download/v4.49.2/yq_linux_amd64" \
  -o /usr/local/bin/yq && chmod +x /usr/local/bin/yq

# Copy sources
COPY jvm/tomcat/src ./tomcat/src
COPY native/tomcat/pom.xml ./tomcat/pom.xml

# Configure virtual threads setting in application.yml
RUN yq -i '.spring.threads.virtual.enabled = (env(VIRTUAL_ENABLED) == "true")' \
  src/main/resources/application.yml

# Build native executable
RUN ./mvnw -B -Pnative native:compile

# Rename binary based on mode
RUN if [ "$VIRTUAL_ENABLED" = "false" ]; then \
      mv target/spring-native-tomcat target/spring-native-tomcat-platform; \
    else \
      mv target/spring-native-tomcat target/spring-native-tomcat-virtual; \
    fi

# Runtime stage - Minimal Debian
FROM debian:13.2-slim
COPY --from=builder /workspace/target/spring-native-tomcat-* /native/
```

### POM Configuration
The native `pom.xml` includes:
- Spring Native plugin
- Native profile
- Native-compatible dependencies
- Build-time configuration

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

# Virtual mode (when built with VIRTUAL_ENABLED=true)
curl "http://localhost:8080/hello/virtual"

# With logging
curl "http://localhost:8080/hello/platform?log=true"
```

### Startup Time Verification
```bash
# Check container logs
docker logs spring-native-tomcat-platform 2>&1 | grep "Started"

# Expected: Started in < 1 second
```

## Monitoring in Grafana

### Key Metrics
```promql
# RPS
rate(hello_request_count_total{service_name="SpringNativeTomcat"}[1m])

# Memory (RSS)
process_memory_rss_bytes{service_name="SpringNativeTomcat"}

# Thread count
process_threads{service_name="SpringNativeTomcat"}
```

## Spring Native Considerations

### What Works Well
- ✅ Spring Web MVC / Tomcat
- ✅ Spring Boot Actuator (basic)
- ✅ Configuration properties
- ✅ Dependency injection
- ✅ REST controllers
- ✅ Virtual threads support

### Potential Limitations
- ⚠️ Some Micrometer integrations
- ⚠️ Advanced OTEL features (no agent)
- ⚠️ Dynamic proxy generation
- ⚠️ CGLIB proxies
- ⚠️ Some AOP features
- ⚠️ Runtime reflection

### Spring Boot 4.0 + Native Status
⚠️ **Early Adoption**: Spring Boot 4.0 is very new:
- Native support is still maturing
- Some features may not work as expected
- Test thoroughly before production use

## Troubleshooting

### Build Failures
- **Out of Memory**: Increase Docker/build machine memory
- **Missing Reflection Config**: Add to Spring Native hints
- **Classpath Scanning Issues**: Explicitly register beans

### Runtime Issues
- **Wrong Endpoint Available**: Check build-time VIRTUAL_ENABLED setting
- **IllegalStateException**: Accessing wrong endpoint for the mode
- **Missing Classes**: Add to native-image configuration

### Performance Issues
- Native doesn't optimize via JIT over time
- Lower throughput is expected vs JVM
- Consider if native is appropriate for use case

## Dependencies

### Build Dependencies
- GraalVM Native Image compiler
- Spring Native plugin
- All JVM dependencies (compile-time)
- yq (YAML processor for build)

### Runtime Dependencies
- Minimal Linux base (Debian slim)
- No JVM required
- Self-contained native executable

## GraalVM Editions

### Enterprise vs Community

| Feature                | Enterprise  | Community    |
|------------------------|-------------|--------------|
| Build Speed            | Faster      | Slower       |
| Binary Performance     | ~10% better | Baseline     |
| Advanced Optimizations | Yes         | No           |
| License                | Oracle      | GPL v2 + CPE |

The repository defaults to Enterprise.

## Known Issues

### Mode Selection at Build Time
- Cannot switch between platform/virtual at runtime
- Requires rebuilding binary for different mode
- Binary name must reflect the mode

### Spring Boot 4.0 Compatibility
- Very new framework version
- Native support still stabilizing
- Limited community experience

### Metrics Limitations
- Fewer automatic metrics than JVM + OTEL agent
- Manual instrumentation may be needed

## Comparison: Native vs JVM

| Aspect        | Native                    | JVM                           |
|---------------|---------------------------|-------------------------------|
| Startup       | ~1s                       | ~3-4s                         |
| Memory        | ~250 MB                   | ~400+ MB                      |
| Throughput    | Lower (no JIT)            | Higher (JIT optimized)        |
| Build Time    | 5-10 min                  | <1 min                        |
| Observability | Limited                   | Comprehensive                 |
| Best For      | Microservices, Serverless | Long-running, High throughput |

## Future Enhancements
- [ ] Complete benchmark results
- [ ] Optimize native configuration
- [ ] Improve metrics coverage
- [ ] Add PGO support
- [ ] Document all native hints needed

## Contributing
When modifying this service:
1. Test both platform and virtual native builds
2. Verify build-time configuration is correct
3. Check new dependencies support native
4. Update reflection configuration if needed
5. Keep JVM source in sync (shares code)

## References
- [Spring Native Documentation](https://docs.spring.io/spring-boot/docs/current/reference/html/native-image.html)
- [GraalVM Native Image](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Spring Boot Tomcat](https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet)
- [Native Build Tools](https://graalvm.github.io/native-build-tools/)
- [Virtual Threads in Spring](https://spring.io/blog/2022/10/11/embracing-virtual-threads)
