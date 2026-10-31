<!-- Generated from `services/java/helidon/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `services/java/helidon/README.md` directly. -->

# Helidon benchmark services

The four services use **Helidon 4.5.6**. SE uses functional routing; MP uses CDI and JAX-RS. Both expose the virtual-thread benchmark endpoint and have JVM and GraalVM native builds.

## Variants

| Module                           | Compose service / telemetry service name | Host port | Health endpoint   |
|----------------------------------|------------------------------------------|-----------|-------------------|
| [SE JVM](se/jvm/README.md)       | `helidon-se-jvm`                         | `8090`    | `/observe/health` |
| [SE native](se/native/README.md) | `helidon-se-native`                      | `8091`    | `/observe/health` |
| [MP JVM](mp/jvm/README.md)       | `helidon-mp-jvm`                         | `8092`    | `/health/live`    |
| [MP native](mp/native/README.md) | `helidon-mp-native`                      | `8093`    | `/health/live`    |

Containers listen on port `8080`. Image tags follow `<service>:4.5.6_latest`. The module READMEs describe only their implementation and runtime differences; the shared contracts and commands live here.

## Version source and updates

Set `HELIDON_VERSION` in [compose/.env](../../../compose/.env). To refresh POM properties, Dockerfile defaults, generated documentation, and IntelliJ build configurations together, run **[doc] Render Updates** in IntelliJ.

For a documentation-only refresh, run from the repository root:

```powershell
node scripts/render-readmes.mjs
node scripts/render-readmes.mjs --check
```

Edit [README.template.md](README.template.md) for shared documentation changes. The renderer reads `HELIDON_VERSION` from the env file; the four module READMEs link here instead of repeating a literal framework version. See the [script guide](../../../scripts/README.md) for individual synchronization commands and check modes. Editing `.env` alone does not refresh generated files.

## Build and run

Run from the repository root, replacing `helidon-se-jvm` with the desired service from the table:

```powershell
docker compose --env-file compose/.env -f compose/docker-compose.yml build helidon-se-jvm
docker compose --env-file compose/.env -f compose/docker-compose.yml up -d --no-build helidon-se-jvm
```

Compose reads the version and supplies the build argument, image tag, telemetry configuration, and resource limits. For IntelliJ Dockerfile builds, use the corresponding **[build-img] Helidon ...** configuration after running **[doc] Render Updates**. Explicit `docker buildx` commands for all four images are in the [service build guide](../../README.md#service-image-builders).

## Endpoint contract

All variants expose `GET /hello/virtual` with the following query parameters:

| Parameter | Default | Behavior                                               |
|-----------|---------|--------------------------------------------------------|
| `sleep`   | `0`     | Integer delay in seconds; negative values are rejected |
| `log`     | `false` | Log the request thread and whether it is virtual       |

The response has content type `application/json` and is a JSON string: `"Hello from Helidon SE virtual REST {value}"` or `"Hello from Helidon MP virtual REST {value}"`. `{value}` comes from the Caffeine lookup for key `"1"`.

The shared request flow records the endpoint counter, optionally sleeps, and reads the cache. SE registers routes from `HelloMode`; MP exposes the route through `HelloResource`. Health endpoints are listed in the variant table and return a JSON health status.

## Application structure

SE and MP have separate implementations with the same application/adapter structure:

| Location under each JVM module | Responsibility                                                   |
|--------------------------------|------------------------------------------------------------------|
| `web/`                         | Routing or JAX-RS resources, HTTP metrics, and MP liveness check |
| `application/HelloService`     | Request flow                                                     |
| `application/port/`            | Cache, metrics, sleep interfaces, `HelloMode`, and `TimeUnit`    |
| `infra/cache/`                 | Caffeine adapter                                                 |
| `infra/metrics/`               | Micrometer adapter and runtime metrics configuration             |
| `infra/time/`                  | Sleep adapter                                                    |

The native POMs reuse their corresponding JVM sources and resources through `build-helper-maven-plugin`. SE creates its adapters in `HelidonApplication`; MP uses CDI-managed beans and startup observers. MP native adds bootstrap and GraalVM integration code, described in its [module guide](mp/native/README.md).

## Observability

The services export traces, metrics, and logs over OTLP/gRPC to Alloy. Compose supplies `OTEL_*` settings and a distinct `service.name` for each variant.

- **Traces:** SE uses WebServer observe tracing with `OtelConfig`; MP uses `helidon-microprofile-telemetry` for SDK initialization and JAX-RS tracing.
- **Metrics:** Micrometer meters bridge to the OTel SDK. `MicrometerMetricsAdapter` records `hello.request.count`; `HttpMetricsFilter` records `http.server.requests`. Additional runtime metrics depend on configuration and runtime support.
- **Logs:** JUL bridges to SLF4J/Logback, and the OTel Logback appender exports correlated log records. MP native installs the appender at runtime.

SE's `OtelConfig` selects the OkHttp gRPC sender provider and logs discovered providers at startup. MP native promotes `OTEL_*` environment settings into `otel.*` system properties before starting Helidon. These details matter when diagnosing transport or initialization changes after a framework upgrade.

## JVM and native packaging

| Runtime | Build and packaging                      | Final image                        |
|---------|------------------------------------------|------------------------------------|
| JVM     | Maven shaded JAR and a jlink JRE         | Distroless `base-debian13:nonroot` |
| Native  | Maven Wrapper and GraalVM `native-image` | Distroless `cc-debian13:nonroot`   |

Dockerfiles define the exact builder images and tool versions. All four use multi-stage builds, non-root runtimes, and service-specific Maven cache mounts. Their Docker build context is `services/java` so shared Checkstyle files are available.

The native POMs configure throughput optimization (`-O2`, `-march=native`), G1, no fallback image, debug/profiler metadata, and JFR/heap-dump support. `-march=native` targets the build CPU. MP additionally constrains native-image analysis parallelism for Weld. Consult each native [MP POM](mp/native/pom.xml) or [SE POM](se/native/pom.xml) for the complete flag list and initialization directives.

Heap, off-heap, CPU, and container limits come from [Compose](../../../compose/docker-compose.yml) and its [env file](../../../compose/.env); native binaries also carry build-time runtime defaults that Compose overrides. Use these sources when tuning, rather than copying fixed heap sizes into module guides.

## Tuning and validation

The implementations warm up meters at startup and cache HTTP status labels to reduce request-path allocation. Server settings such as the backlog, concurrent-request limit, and idle timeout live in each JVM module's `src/main/resources/application.yaml`, which is also reused by its native build.

For Java changes, run `mvn verify -B` from the affected module. Native packaging and native-image flags additionally require a native image build to validate; JVM tests alone do not exercise GraalVM analysis. See the [testing guide](../../../docs/TESTING.md) for broader checks.
