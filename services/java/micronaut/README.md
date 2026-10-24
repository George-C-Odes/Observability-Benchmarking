<!-- Generated from `services/java/micronaut/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `services/java/micronaut/README.md` directly. -->

# Micronaut benchmark services

The JVM and native services use **Micronaut 5.2.20**, Netty, compile-time dependency injection, and the same application sources. Each deployment exposes platform-thread, virtual-thread, and reactive endpoints, plus an experimental event-loop route.

## Variants

| Module                     | Compose service / telemetry service name | Host port | Health endpoint |
|----------------------------|------------------------------------------|-----------|-----------------|
| [JVM](jvm/README.md)       | `micronaut-jvm`                          | `8088`    | `/health`       |
| [Native](native/README.md) | `micronaut-native`                       | `8089`    | `/health`       |

Containers listen on port `8080`. Image tags follow `<service>:5.2.20_latest`. Module READMEs describe their runtime-specific packaging and troubleshooting; shared behavior and commands live here.

## Version source and updates

Set `MICRONAUT_VERSION` in [compose/.env](../../../compose/.env), then run **[doc] Render Updates** in IntelliJ to synchronize POM properties, Dockerfile defaults, generated documentation, and build image configurations together.

For a documentation-only refresh, run from the repository root:

```powershell
node scripts/render-readmes.mjs
node scripts/render-readmes.mjs --check
```

Edit [README.template.md](README.template.md) for shared documentation changes. The renderer reads `MICRONAUT_VERSION` from the env file; module READMEs link here instead of repeating literal framework versions. Micronaut integration modules and other library versions retain their own properties in the POMs. See the [script guide](../../../scripts/README.md) for individual synchronization commands. Editing `.env` alone does not refresh generated files.

## Build and run

Run from the repository root, substituting `micronaut-native` when building the native variant:

```powershell
docker compose --env-file compose/.env -f compose/docker-compose.yml build micronaut-jvm
docker compose --env-file compose/.env -f compose/docker-compose.yml up -d --no-build micronaut-jvm
```

Compose reads the framework version and supplies the image tag, build argument, telemetry settings, and resource limits. For IntelliJ Dockerfile builds, use the corresponding **[build-img] Micronaut ...** configuration after **[doc] Render Updates**. Explicit `docker buildx` commands are in the [service build guide](../../README.md#service-image-builders). Both Dockerfiles use `services/java` as the build context.

## Endpoint and thread contracts

The shared [HelloController](jvm/src/main/java/io/github/georgecodes/benchmarking/micronaut/web/HelloController.java) defines all four routes:

| GET endpoint                | Execution model                                          | Controller declaration                                          |
|-----------------------------|----------------------------------------------------------|-----------------------------------------------------------------|
| `/hello/platform`           | Fixed platform-thread executor                           | `@Blocking`, `@ExecuteOn("platform")`                           |
| `/hello/virtual`            | Virtual-thread executor                                  | `@ExecuteOn("virtual")`                                         |
| `/hello/reactive`           | Reactor `Mono.fromSupplier` on the event loop            | `@NonBlocking`                                                  |
| `/hello/virtual-event-loop` | Event loop; virtual carrier only when enabled on the JVM | `@NonBlocking`; experimental, excluded from headline benchmarks |

All routes accept `sleep` (integer, default `0`; delay in seconds when positive) and `log` (boolean, default `false`; logs the executing thread and its virtual status). Responses use `application/json` and follow `Hello from Micronaut {mode} REST {value}`, where `{value}` is read from the Caffeine cache at key `"1"`.

Every route calls the same service: record `hello.request.count`, optionally sleep, then read the cache. The reactive route wraps this work in `Mono.fromSupplier`; its positive `sleep` still calls the blocking sleep adapter rather than a reactive timer. Consider this when interpreting event-loop results.

For a JVM container started with Compose:

```powershell
curl.exe http://localhost:8088/health
curl.exe "http://localhost:8088/hello/virtual?log=true"
```

Use port `8089` for the native container, or `8080` for a local application using its default server port.

## Shared application structure

| Location under [jvm/src/main](jvm/src/main) | Responsibility                                                 |
|---------------------------------------------|----------------------------------------------------------------|
| `MicronautApplication`                      | Application entrypoint                                         |
| `web/HelloController`                       | HTTP endpoints and executor selection                          |
| `application/HelloService`                  | Common request flow                                            |
| `application/port/`                         | Cache, metrics, sleep interfaces, `HelloMode`, and `TimeUnit`  |
| `infra/cache/CaffeineCacheAdapter`          | Configurable, pre-populated Caffeine cache with one-day expiry |
| `infra/time/ThreadSleepAdapter`             | Blocking sleep implementation                                  |
| `infra/metrics/`                            | Micrometer adapter, OTel bridge, and additional runtime meters |

The native POM reuses the JVM sources, resources, and test sources through `build-helper-maven-plugin`. Its Dockerfile copies the shared source tree into the builder workspace. Shared application changes belong in the JVM module.

## Configuration and telemetry

[application.yml](jvm/src/main/resources/application.yml) defines executor defaults, manual thread selection, Netty event loops, cache configuration, management endpoints, and telemetry. [Compose](../../../compose/docker-compose.yml) overrides settings for benchmark runs; [compose/.env](../../../compose/.env) supplies resource and feature controls.

- `CACHE_SIZE` controls cache population. The cache adapter validates and clamps the configured size.
- Platform executor size and Netty event-loop count are supplied from the Compose CPU limit. Local application defaults can differ.
- `MICRONAUT_LOOM_CARRIER` supplies the JVM's `MICRONAUT_NETTY_EVENT_LOOPS_DEFAULT_LOOM_CARRIER` setting. Native Compose configuration forces that setting to `false`.
- `HEAP_MIN`, `HEAP_MAX`, `OFF_HEAP_MAX`, and container limits define benchmark resources. Consult Compose for the full JVM/native option lists.

Both services embed the OpenTelemetry SDK; their Dockerfiles do not install an OTel Java agent. Compose supplies `OTEL_*` settings for OTLP/gRPC export to Alloy and the distinct service names in the variant table.

| Signal  | Application wiring                                                                                                                      |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Traces  | `micronaut-tracing-opentelemetry-http` HTTP instrumentation                                                                             |
| Metrics | `OtelConfig` creates an `OpenTelemetryMeterRegistry` bridge; Micrometer's separate OTLP registry is disabled to avoid duplicate exports |
| Logs    | `OtelConfig` installs the SDK into the OTel Logback appender at application startup                                                     |

`hello.request.count` is tagged by endpoint. HTTP and additional runtime metrics depend on enabled binders, Compose toggles, and runtime support. Filter Grafana queries by `service_name="micronaut-jvm"` or `service_name="micronaut-native"` when comparing variants. Native profiling and initialization constraints are covered in its [module guide](native/README.md).

## Validation

Run `mvn verify -B` from the affected module for Java tests, coverage, and configured checks. Shared tests cover controller routes/logging, service request flow and interrupt handling, cache configuration, sleep adapters, and metrics wiring. For interactive JVM development, run `mvn mn:run` from `services/java/micronaut/jvm`.

Native-image configuration and dependency changes additionally require a native build; JVM tests do not exercise GraalVM reachability analysis. Compare performance using saved [benchmark results](../../../results/benchmarks) and the [benchmarking guide](../../../docs/benchmarking.md), recording resource limits, telemetry flags, and Loom-carrier settings with each run.
