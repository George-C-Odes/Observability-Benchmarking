# Spark JVM Service

A lightweight, high-throughput REST service implemented with SparkJava (Zoomba fork) on **Java 25**.

This module mirrors the `/hello/*` contracts used by the existing Quarkus and Spring JVM services.

## Endpoints

- `GET /hello/platform`
- `GET /hello/virtual`

### Query params
- `sleep` (int, default `0`) – sleep duration in **seconds**
- `log` (boolean, default `false`) – logs the current thread

### Responses
- `Hello from Spark platform REST value-1`
- `Hello from Spark virtual REST value-1`

## Thread modes
This service can run in either mode (one mode per deployment), controlled via env var:

- `THREAD_MODE=platform` (default)
- `THREAD_MODE=virtual`

If the service is started in platform mode, `/hello/virtual` returns `500` and vice-versa, matching the Spring JVM behavior.

> Note on `SPARK_VIRTUAL_EXECUTION_MODE` and `/hello/virtual`:
> When `THREAD_MODE=virtual`, the `/hello/virtual` handler may still offload work to the executor when
> `SPARK_VIRTUAL_EXECUTION_MODE=offload` (or when handler execution is set to `offload`).
> This is intentional: it keeps Spark itself in platform-thread mode while forcing the business work to run on
> virtual threads via the executor. This allows comparing “Spark-managed vthreads” vs “explicit offload to vthreads”.

## Configuration (env)
- (Service listens on container port `8080`; host ports are configured by docker compose)
- `THREAD_MODE` (default `platform`)
- `CACHE_SIZE` (default `50000`)
- `JETTY_MAX_THREADS` (default `0` → Spark/Jetty default)
- `JETTY_MIN_THREADS` (default `0` → Spark/Jetty default)
- `JETTY_IDLE_TIMEOUT_MS` (default `60000`)
- `JETTY_ACCEPT_QUEUE_SIZE` (default `10000`)

### Throughput tuning
- `SPARK_HANDLER_EXECUTION_MODE`:
  - `direct` (default) – handler runs on Spark's request thread (fastest)
  - `offload` – handler work is offloaded to an executor (useful for isolating blocking work)
- `SPARK_PLATFORM_EXECUTOR_THREADS` (default `0` → computed) – only used when `THREAD_MODE=platform` and `SPARK_HANDLER_EXECUTION_MODE=offload`
- `SPARK_VIRTUAL_EXECUTION_MODE`:
  - `spark` (default) – rely on Spark's built-in virtual-thread support
  - `offload` – keep Spark in platform-thread mode but enforce virtual threads by offloading

### Jetty tuning
Jetty is tuned via Spark's built-in `threadPool(max, min, acceptQueueSize)` wiring:
- `JETTY_MAX_THREADS`
- `JETTY_MIN_THREADS`
- `JETTY_ACCEPT_QUEUE_SIZE`
- `JETTY_IDLE_TIMEOUT_MS`

## Metrics
Defines a Micrometer counter:
- `hello.request.count{endpoint="/hello/platform"}`
- `hello.request.count{endpoint="/hello/virtual"}`

Also binds `ProcessMemoryMetrics` and `ProcessThreadMetrics` (micrometer-jvm-extras).

Export is typically done via the OpenTelemetry Java agent in the benchmark stack.