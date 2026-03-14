# Dropwizard JVM Service

A lightweight, high-throughput REST service implemented with Dropwizard 5.x on **Java 25**.

This module mirrors the `/hello/*` contracts used by the existing Javalin JVM, Spring JVM, and Spark JVM services.

## Endpoints

- `GET /hello/platform`
- `GET /hello/virtual`
- `GET /ready` – readiness probe (returns `UP`)

### Query params
- `sleep` (int, default `0`) – sleep duration in **seconds**
- `log` (boolean, default `false`) – logs the current thread

### Responses
- `Hello from Dropwizard platform REST value-1`
- `Hello from Dropwizard virtual REST value-1`

## Health Check

Dropwizard 5.x provides a built-in `/healthcheck` endpoint on the **admin** connector.
For benchmarking, the admin connector is disabled to avoid overhead.
Instead, a lightweight `/ready` JAX-RS resource is registered on the application port,
consistent with Spark and Javalin.

To re-enable Dropwizard's built-in health check, set `adminConnectors` in `dropwizard-config.yml`.

## Thread modes
One mode per deployment, controlled via env var:

- `THREAD_MODE=platform` (default) – Jetty QueuedThreadPool
- `THREAD_MODE=virtual` – Jetty 12 VirtualThreadPool (Project Loom)

If the service is started in platform mode, `/hello/virtual` returns `500` and vice-versa.

## Configuration (env)
- `SERVICE_PORT` (default `8080`)
- `THREAD_MODE` (default `platform`)
- `CACHE_SIZE` (default `50000`)
- `JETTY_MAX_THREADS` (default `0` → computed)
- `JETTY_MIN_THREADS` (default `0` → computed)
- `JETTY_ACCEPT_QUEUE_SIZE` (default `10000`)
- `JETTY_IDLE_TIMEOUT_MS` (default `60000`)

## Docker

**Image**: `dropwizard-jvm:latest`

| Stage   | Image                                                        |
|---------|--------------------------------------------------------------|
| Build   | `maven:3.9.14-eclipse-temurin-25-noble`                      |
| Runtime | `gcr.io/distroless/base-debian13:nonroot` + jlink custom JRE |

- Multi-stage build: Maven package → jlink (strips unused JDK modules) → distroless
- The runtime image contains only the application JAR, Dropwizard YAML config + a minimal custom JRE in `/opt/jre`
- Dropwizard requires the `server` command and config path at startup

### Build Command

```powershell
docker buildx build `
  -f services/java/dropwizard/jvm/Dockerfile `
  -t dropwizard-jvm:latest `
  --build-arg DROPWIZARD_VERSION=5.0.1 `
  --build-arg BUILDKIT_BUILD_NAME=dropwizard-jvm:latest `
  --load `
  services/java
```

## Metrics
Defines a Micrometer counter:
- `hello.request.count{endpoint="/hello/platform"}`
- `hello.request.count{endpoint="/hello/virtual"}`

Also binds `ProcessMemoryMetrics` and `ProcessThreadMetrics` (micrometer-jvm-extras).

Export is typically handled by the OpenTelemetry Java agent in the benchmark stack.

