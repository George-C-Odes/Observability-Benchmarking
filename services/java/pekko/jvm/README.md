<!-- Generated from services/java/pekko/jvm/README.template.md. Do not edit services/java/pekko/jvm/README.md directly. -->

# Pekko JVM Service
A fully reactive, high-throughput REST service implemented with **Pekko HTTP 1.4.2** and **Pekko Core 1.7.1** on **Java 25**.
This module provides a `/hello/reactive` endpoint for benchmarking Pekko HTTP's
non-blocking I/O model. All request handling runs on the Pekko default dispatcher — no blocking,
no virtual threads, no thread-per-request overhead.
## Endpoints
- `GET /hello/reactive`
- `GET /ready`
### Query params
- `sleep` (int, default `0`) — sleep duration in **seconds** (uses non-blocking Pekko scheduler)
- `log` (boolean, default `false`) — logs the current thread
### Responses
- `Hello from Pekko reactive REST value-1`
## Architecture
```
config/    -> ServiceConfig (env-driven, Java record)
domain/    -> HelloMode, HelloService (pure logic, no framework deps)
infra/     -> CacheProvider, MetricsProvider (Caffeine, Micrometer)
web/       -> HelloRoutes (Pekko HTTP routing DSL)
```
Follows clean architecture / hexagonal principles:
- Domain layer is framework-agnostic
- Infrastructure adapters are injected via constructor
- Web layer is a thin routing adapter
## Configuration (env)
- `SERVICE_PORT` (default `8080`)
- `CACHE_SIZE` (default `50000`)
### Build versions
`compose/.env` is authoritative for both independently released Pekko components:
- `PEKKO_VERSION` selects Pekko HTTP (`pekko.version`); image tags and `webengine.version` follow HTTP.
- `PEKKO_CORE_VERSION` selects Core actor/stream/SLF4J modules (`pekko.core.version`).

After changing either pin, run `node scripts/sync-framework-versions.mjs` (or IntelliJ **[doc] Render Updates**)
to refresh literal Maven/Docker defaults, IDE build arguments, and documentation. Compose passes both pins as build arguments.
Review HTTP/Core compatibility when changing release lines; the synchronizer does not resolve compatible pairs.
## Docker
**Image**: `pekko-jvm:1.4.2_latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.10.0-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

- Multi-stage build: Maven package → jlink (strips unused JDK modules) → distroless
- The runtime image contains only the application JAR + a minimal custom JRE in `/opt/jre`
- OpenTelemetry Java agent for full batched observability (traces, metrics, logs) via gRPC
## Throughput Tuning
- **Pekko HTTP server**: Direct Pekko HTTP server
- **No DI container**: All wiring is manual for minimal overhead
- **Non-blocking sleep**: Uses Pekko scheduler for timer-based sleep
- **Pipelining**: HTTP/1.1 pipelining-limit=32 for keep-alive benchmarks
- **No compression**: Short JSON payloads don't benefit; saves CPU
- **Netty leak detection disabled**: Zero overhead in production
- **Dispatcher tuning**: ForkJoin throughput=128 reduces context switches
## Metrics
Defines a Micrometer counter:
- `hello.request.count{endpoint="/hello/reactive"}`
Also binds `ProcessMemoryMetrics`, `ProcessThreadMetrics` (micrometer-jvm-extras),
and standard JVM metrics (GC, memory, threads, classloader, processor).
Export is handled by the OpenTelemetry Java agent in the benchmark stack.
