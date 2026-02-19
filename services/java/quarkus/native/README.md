# Quarkus Native Service

## Overview
A high-performance REST service implementation built with Quarkus 3.31.4 compiled to a native executable using GraalVM Native Image. This service supports three different thread models in a single deployment, offering fast startup times and low memory footprint.

## Purpose
- Demonstrate Quarkus native compilation performance benefits
- Compare native vs JVM execution across platform, virtual, and reactive thread models
- Achieve sub-second startup times with minimal memory usage
- Provide comprehensive observability in a native-compiled binary

## Service Details

### Framework & Runtime
- **Framework**: Quarkus 3.31.4
- **Compiler**: GraalVM Native Image (Enterprise or Community)
- **Base Java**: 25.0.2
- **GC**: G1 Garbage Collector (Enterprise only)
- **Thread Models**: Platform, Virtual, and Reactive (all in one deployment)

### Endpoints

#### `GET /hello/platform`
Handles requests using standard platform threads in native mode.

**Query Parameters**:
- `sleep` (int, default: 0) - Sleep duration in seconds
- `log` (boolean, default: false) - Enable detailed thread logging

**Response**: `"Hello from Quarkus platform REST {value}"`

#### `GET /hello/virtual`
Handles requests using Java virtual threads in native compilation.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Quarkus virtual REST {value}"`

#### `GET /hello/reactive`
Handles requests using reactive programming with Mutiny.

**Query Parameters**: Same as `/platform`

**Response**: `"Hello from Quarkus reactive REST {value}"`

## Configuration Options

### Build-Time Configuration

#### Native Image Build Arguments
```bash
# Frame Pointer & Debugging
-H:+PreserveFramePointer
-H:-DeleteLocalSymbols
-H:-StripDebugInfo
-H:GenerateDebugInfo=1

# Memory Management (Enterprise)
-R:+AlwaysPreTouch
-R:MaxGCPauseMillis=200
-R:MaxDirectMemorySize=64m
-R:MaxHeapSize=1280m
-R:MinHeapSize=1280m

# Performance Optimization
-march=native
--link-at-build-time=ALL
--future-defaults=all

# Garbage Collector (Enterprise only)
--gc=G1

# Monitoring Support
--enable-monitoring=heapdump,jfr

# Initialization Strategies
--initialize-at-build-time=jdk.nio.zipfs.*,sun.nio.fs.*
--initialize-at-run-time=org.fusesource.jansi.internal

# Native Access
--enable-native-access=ALL-UNNAMED
```

### Runtime Configuration

#### Environment Variables

| Variable                      | Description                      | Default/Configured  |
|-------------------------------|----------------------------------|---------------------|
| `QUARKUS_HTTP_HOST`           | Bind address                     | `0.0.0.0`           |
| `QUARKUS_HTTP_PORT`           | HTTP server port                 | `8080`              |
| `QUARKUS_PROFILE`             | Active configuration profile     | `stage`             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `alloy:4317`        |
| `OTEL_SERVICE_NAME`           | Service name for telemetry       | `QuarkusNative`     |
| `OTEL_SDK_DISABLED`           | Disable OTEL during build        | `true` (build only) |

#### Application Configuration
Same as JVM version - see `services/quarkus/jvm/src/main/resources/application.yml`:

- HTTP server configuration (port 8080, backlog 10000, etc.)
- Thread pool configuration (max 200 threads)
- Virtual thread support enabled
- Micrometer metrics with JVM, HTTP, and virtual thread binders
- JSON console logging
- Health checks enabled

### Native Image Runtime Options (Command Line)
```bash
# Memory
-Xms1280M -Xmx1280M

# GC (Enterprise)
-XX:MaxGCPauseMillis=200

# Direct Memory
-XX:MaxDirectMemorySize=64M

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

### Standard Metrics
Same metrics as JVM version:
- HTTP server request metrics
- JVM memory metrics (adapted for native)
- GC metrics (if G1 enabled)
- Thread metrics
- Process memory metrics (RSS, VSS)

### Observability Integration

#### OpenTelemetry
- **Metrics**: OTLP gRPC export to Alloy/Mimir
- **Tracing**: Limited compared to JVM (no Java agent in native)
- **Logging**: JSON structured logs to stdout/Loki

#### Profiling Options
- **JFR (Java Flight Recorder)**: Supported in Enterprise GraalVM
  - `--enable-monitoring=jfr` (build-time)
  - Runtime flags: `-XX:+FlightRecorder`, `-XX:StartFlightRecording=...`
- **Pyroscope Java Agent**: Not available (JVM agent only)
- **eBPF Profiling**: Supported via Alloy/Pyroscope eBPF collector

## Architecture

### Native Compilation Benefits
- **Fast Startup**: ~0.05-0.1 seconds (vs 2-3s for JVM)
- **Low Memory**: ~200-300 MB total (vs 400+ MB for JVM)
- **Small Image**: Base image + native binary (~100-150 MB)
- **Instant Peak Performance**: No warmup required

### Native Compilation Trade-offs
- **Build Time**: 3-5 minutes (vs seconds for JVM)
- **Build Memory**: Requires 10GB+ for native image compilation
- **Limited Reflection**: Requires explicit configuration
- **Reduced Observability**: No Java agent support
- **Debug Complexity**: Native debugging different from JVM

### Cache Implementation
Same as JVM version:
- **Library**: Caffeine cache
- **Size**: 50,000 entries
- **Pre-population**: At startup (keys "1"-"50000")

### Thread Models
Same as JVM version:
- Platform threads
- Virtual threads
- Reactive (Vert.x event loops)

## Performance Characteristics

### Benchmark Results (2 vCPU limit)

| Mode     | RPS    | vs JVM |
|----------|--------|--------|
| Virtual  | 27,000 | -40%   |
| Reactive | 20,000 | -56%   |
| Platform | 20,000 | -44%   |

### Analysis
- Native compilation doesn't always mean better throughput
- Startup time and memory are significantly better
- Reactive mode shows best performance in native
- JVM's JIT compiler can optimize hot paths better over time
- Native is best for: serverless, high-density deployments, fast scaling

### Resource Usage
- **Heap Memory**: 1280 MB (configured)
- **RSS**: ~200-300 MB typical
- **Startup Time**: <100ms
- **Container Size**: ~150 MB

## Building and Running

### Prerequisites
- GraalVM Native Image 25.0.2+ (Enterprise or Community)
- Maven 3.9+
- Docker (for containerized build)
- 16GB+ RAM (for native compilation)

### Native Build (Local)
```bash
cd services/quarkus/native

# Install dependencies
./mvnw dependency:go-offline

# Build native executable (requires native-image tool)
./mvnw verify -Dnative \
  -Dquarkus.profile=stage \
  -Dquarkus.native.native-image-xmx=10g \
  -Dmaven.compiler.release=25
```

### Docker Build (Recommended)
```bash
# Use multi-stage Dockerfile
cd services/quarkus
docker build -f native/Dockerfile -t quarkus-native:latest .

# Builder stage: GraalVM Native Image compilation
# Runner stage: Debian slim with native binary
```

### Docker Compose
```bash
# From repository root
docker compose --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up quarkus-native -d
```

### Runtime Execution
```bash
# Direct execution of native binary
./target/quarkus-native-runner

# With runtime options (Enterprise GraalVM)
./target/quarkus-native-runner \
  -Xmx1280M \
  -XX:MaxGCPauseMillis=200
```

## Build Configuration

### Dockerfile Highlights
```dockerfile
# Builder stage - GraalVM Native Image
FROM container-registry.oracle.com/graalvm/native-image:25.0.2-ol9

# Source code from JVM build (shared)
COPY jvm/src /code/src

# Native-specific pom.xml
COPY native/pom.xml /code/pom.xml

# Build with extensive native-image args
RUN ./mvnw verify -Dnative ...

# Runtime stage - Minimal Debian
FROM debian:13.2-slim
COPY --from=builder /code/target/*-runner /native/quarkus-native
```

### POM Configuration
The native `pom.xml` extends the JVM version with:
- Native profile activation
- GraalVM Native Image plugin
- Native-specific build properties
- Adjusted dependencies (some libraries need native support)

## Testing

### Health Checks
```bash
# Readiness
curl http://localhost:8080/q/health/ready

# Liveness  
curl http://localhost:8080/q/health/live
```

### Endpoint Testing
```bash
# Platform threads
curl "http://localhost:8080/hello/platform"

# Virtual threads
curl "http://localhost:8080/hello/virtual"

# Reactive
curl "http://localhost:8080/hello/reactive"
```

### Startup Time Verification
```bash
# Check container logs for startup time
docker logs quarkus-native 2>&1 | grep "started in"

# Expected: started in 0.0XXs
```

## Monitoring in Grafana

### Key Metrics
Same queries as JVM version, filtered by service name:
```promql
# RPS
rate(hello_request_count_total{service_name="QuarkusNative"}[1m])

# Memory (RSS)
process_memory_rss_bytes{service_name="QuarkusNative"}
```

## GraalVM Editions

### Enterprise vs Community

| Feature     | Enterprise     | Community                  |
|-------------|----------------|----------------------------|
| G1 GC       | ✅ Yes          | ❌ No (serial/epsilon only) |
| Performance | ~10% better    | Baseline                   |
| Build Time  | Faster         | Slower                     |
| Image       | Oracle         | GraalVM                    |
| License     | Oracle License | GPL v2 + CPE               |

**Recommendation**: Use Enterprise for production benchmarks. The repository defaults to Enterprise.

## JFR Support (Enterprise Only)

### Enable JFR at Build
```bash
-Dquarkus.native.monitoring=jfr
--enable-monitoring=heapdump,jfr
```

### Start with JFR Recording
```bash
./quarkus-native \
  -XX:+FlightRecorder \
  -XX:StartFlightRecording=disk=true,filename=/tmp/recording.jfr,settings=profile
```

**Note**: JFR in native is less mature than JVM JFR. Some events may not be available.

## Troubleshooting

### Build Failures
- **Out of Memory**: Increase `-Dquarkus.native.native-image-xmx=10g`
- **Missing Reflection Config**: Add to `reflect-config.json`
- **Class Initialization Errors**: Adjust `--initialize-at-build-time` or `--initialize-at-run-time`

### Runtime Issues
- **Heap Dumps Not Generated**: Check `/var/log/error` volume mount
- **Performance Lower Than Expected**: 
  - Native doesn't benefit from JIT optimization
  - Check GC configuration (G1 vs serial)
  - Ensure `-march=native` was used in build

## Dependencies

### Build Dependencies
- GraalVM Native Image compiler
- All JVM dependencies (compile-time)
- Native image reflection metadata

### Runtime Dependencies
- Minimal Linux base (Debian slim)
- No JVM required
- Shared libraries for native binary

## Known Issues
- Limited Java agent support (no OTEL agent, no Pyroscope agent)
- Profile-to-span correlation not available
- Some Quarkus extensions don't support native compilation

## Contributing
When modifying this service:
1. Test native compilation locally (requires significant resources)
2. Verify all three thread models work in native
3. Update native build arguments if dependencies change
4. Document any reflection configuration needed
5. Keep this README synchronized with JVM version where applicable

## References
- [Quarkus Native Guide](https://quarkus.io/guides/building-native-image)
- [GraalVM Native Image](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Native Image Build Configuration](https://www.graalvm.org/latest/reference-manual/native-image/overview/BuildConfiguration/)
- [Quarkus Native Tips](https://quarkus.io/guides/writing-native-applications-tips)
