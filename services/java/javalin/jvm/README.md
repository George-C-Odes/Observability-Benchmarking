# Javalin JVM Service

A lightweight, high-throughput REST service implemented with Javalin on **Java 25**.

This module mirrors the `/hello/*` contracts used by the existing Spring JVM and Spark JVM services.

## Endpoints

- `GET /hello/platform`
- `GET /hello/virtual`

### Query params
- `sleep` (int, default `0`) – sleep duration in **seconds**
- `log` (boolean, default `false`) – logs the current thread

### Responses
- `Hello from Javalin platform REST value-1`
- `Hello from Javalin virtual REST value-1`

## Thread modes
One mode per deployment, controlled via env var:

- `THREAD_MODE=platform` (default)
- `THREAD_MODE=virtual`

If the service is started in platform mode, `/hello/virtual` returns `500` and vice-versa.

## Configuration (env)
- `SERVICE_PORT` (default `8080`)
- `THREAD_MODE` (default `platform`)
- `CACHE_SIZE` (default `50000`)
- `JETTY_MAX_THREADS` (default `0` → computed)
- `JETTY_MIN_THREADS` (default `0` → computed)
- `JETTY_ACCEPT_QUEUE_SIZE` (default `10000`)
- `JETTY_IDLE_TIMEOUT_MS` (default `60000`)

### Throughput tuning
- `JAVALIN_HANDLER_EXECUTION_MODE`:
  - `direct` (default) – handler runs on Jetty request thread (fastest)
  - `offload` – handler work is offloaded to an executor
- `JAVALIN_PLATFORM_EXECUTOR_THREADS` (default `0` → computed) – only used when `THREAD_MODE=platform` and `JAVALIN_HANDLER_EXECUTION_MODE=offload`

## Metrics
Defines a Micrometer counter:
- `hello.request.count{endpoint="/hello/platform"}`
- `hello.request.count{endpoint="/hello/virtual"}`

Also binds `ProcessMemoryMetrics` and `ProcessThreadMetrics` (micrometer-jvm-extras).

Export is typically handled by the OpenTelemetry Java agent in the benchmark stack.