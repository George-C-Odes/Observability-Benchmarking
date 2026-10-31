<!-- Generated from `integration-tests/README.template.md` via `scripts/render-readmes.mjs`. Do not edit `integration-tests/README.md` directly. -->

# Integration Tests

The Bash runner checks deployment responses, health endpoints, runtime log markers, telemetry ingestion, shared stack readiness, and a small wrk2 workload. It assumes the Compose stack is already running and never starts or reconfigures containers.

## Prerequisites

- Bash 4.0 or newer (Linux, WSL, or Git Bash).
- curl, Python 3.9 or newer (standard library only), awk, and GNU coreutils, including `timeout` with `--kill-after` support.
- Docker CLI/daemon access for the `logs` and `wrk2` groups. HTTP-only groups can run without Docker access.
- The service and observability containers required by the selected groups.

`PYTHON` selects the Python executable; its default is `python3`. On systems where only `python` is available, set `PYTHON=python`.

In WSL, Docker Desktop's [WSL Integration](https://docs.docker.com/desktop/features/wsl/#enabling-docker-support-in-wsl-2-distributions) exposes the Linux Docker socket to the distro. Windows can reach Docker Desktop while an unintegrated WSL distro still has no `/var/run/docker.sock`.

For this specific missing-default-socket case, the runner can use [WSL Windows executable interoperability](https://learn.microsoft.com/en-us/windows/wsl/interop#run-windows-tools-from-linux): it locates `docker.exe` on PATH, checks that its `desktop-linux` context uses a local named pipe, and selects that executable/context for all subsequent Docker checks. It does not auto-select a remote context. Explicit `DOCKER_BIN`, `DOCKER_HOST`, or `DOCKER_CONTEXT` settings disable this automatic fallback. If the Windows executable is unavailable, the preflight explains how to enable WSL Integration for the current distro.

You can also select the client explicitly:

```bash
DOCKER_BIN=docker.exe DOCKER_CONTEXT=desktop-linux bash integration-tests/run-integration-tests.sh
```

`DOCKER_BIN` accepts one executable name or path, including paths with spaces; shell command strings are not evaluated. The preflight prints the selected client/context, and the JSON report records them in `configuration`.

## Quick start

Run from the repository root. Start the desired Compose profiles with wrk2 autorun disabled so background benchmarks do not interfere with the checks:

```bash
WRK_AUTORUN=false docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up -d
bash integration-tests/run-integration-tests.sh
```

PowerShell can start the stack with:

```powershell
$env:WRK_AUTORUN="false"
docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up -d
```

The runner polls health endpoints before service assertions. A failed prerequisite records one failure and marks dependent checks as skipped; independent tests continue. Each logical test records exactly one result, including health checks with alternative endpoints.

## Select services and groups

```bash
bash integration-tests/run-integration-tests.sh --list
bash integration-tests/run-integration-tests.sh --services go,quarkus-jvm --groups deployment,health
bash integration-tests/run-integration-tests.sh --services go --groups logs,telemetry
bash integration-tests/run-integration-tests.sh --groups stack,wrk2
```

Both filters accept comma-separated, exact names. Unknown names, empty entries, and missing option values exit with a configuration error. With no arguments, every service and group is selected. `--services` applies to benchmark services; shared `stack` and `wrk2` checks are selected through `--groups`.

| Group        | Checks                                                                                                                                 |
|--------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `health`     | Accepts one configured metrics/health endpoint per service; polls until startup deadline                                               |
| `deployment` | Requires HTTP 200 and the expected literal framework substring for each hello endpoint; preserves the explicit health-route assertions |
| `logs`       | Requires a successful `?log=true` request and a fresh Docker log containing the expected runtime/thread marker                         |
| `telemetry`  | Sends a sampled W3C trace context; checks fresh service metrics in Mimir, runtime logs in Loki, and that exact service trace in Tempo  |
| `stack`      | Polls Grafana, Alloy, Loki, Mimir, Tempo, Pyroscope, Next.js, and both orchestrator health routes                                      |
| `wrk2`       | Polls wrk2 readiness, then checks completed requests with no HTTP/socket errors                                                        |

A `health` result is always recorded as a prerequisite when `deployment`, `logs`, or `telemetry` is selected. Health endpoint availability is a smoke check; it does not establish that metrics reached Mimir. Selecting `logs` or `wrk2` also records one Docker connectivity result in the automatic `preflight` group. If it fails, Docker-dependent checks are skipped rather than reporting the same connectivity failure for every endpoint; HTTP checks still run.

The service IDs, URL variable names, default ports, expected response substrings, alternative health paths, and endpoint/thread markers live in [services.txt](services.txt). An empty thread marker identifies a deployment-only health route. The same table drives deployment, health, logs, and telemetry checks. The regression suite checks its hello endpoints against [benchmark-targets.txt](../config/benchmark-targets.txt).

## Timeouts and output

| Environment variable     | Default                                    | Purpose                                                                                        |
|--------------------------|--------------------------------------------|------------------------------------------------------------------------------------------------|
| `REQUEST_TIMEOUT`        | `2`                                        | Maximum seconds per HTTP request                                                               |
| `CONNECT_TIMEOUT`        | `2`                                        | Maximum seconds to connect; also bounded by request timeout                                    |
| `STARTUP_TIMEOUT`        | `30`                                       | Deadline for each service/shared readiness check                                               |
| `LOG_TIMEOUT`            | `5`                                        | Deadline for a fresh runtime log after the request                                             |
| `TELEMETRY_TIMEOUT`      | `90`                                       | Deadline for each backend's ingestion check; allows periodic metric export                     |
| `DOCKER_TIMEOUT`         | `10`                                       | Maximum seconds per Docker command; forced termination follows after two seconds               |
| `DOCKER_STARTUP_TIMEOUT` | `30`                                       | Deadline for retrying Docker daemon connectivity with the lightweight `docker version` command |
| `POLL_INTERVAL`          | `0.5`                                      | Seconds between polling attempts                                                               |
| `OUTPUT_DIR`             | `integration-tests/output`                 | Output directory (default is relative to the script)                                           |
| `PYTHON`                 | `python3`                                  | Python executable for JSON parsing and reports                                                 |
| `DOCKER_BIN`             | `docker` (automatic WSL fallback eligible) | Docker executable name or path; an explicit value disables automatic client selection          |

Timeouts must be positive integers; the polling interval may be fractional. Each polling attempt uses the remaining deadline as its upper bound. Docker commands use `DOCKER_TIMEOUT`, independently of the HTTP request timeout. `DOCKER_TIMEOUT` must be at least five seconds when `wrk2` is selected because its workload lasts three seconds. A telemetry timeout below ten seconds prints a warning: exporter intervals and collector batching can exceed it even on a healthy stack. curl failures retain their exit code and error message. Invalid requests and authentication failures (HTTP 400, 401, 403, 405, or 422) fail immediately; pending traces (404), throttling, and server failures remain retryable. Docker errors are distinguished from application logs written to stderr.

```bash
STARTUP_TIMEOUT=60 TELEMETRY_TIMEOUT=120 PYTHON=python \
  bash integration-tests/run-integration-tests.sh --services go --groups deployment,telemetry
```

Each initialized run writes a unique UTC timestamp plus random suffix to `output/`, with matching `.log` and `.json` files. Output is tee'd to the log, and the runner waits for tee to drain before exiting. Reports contain `started_at`, `exit_code`, `log_file`, `passed`, `failed`, `skipped`, `configuration`, and a `tests` array. Configuration records the effective timeouts, filters, polling interval, Bash version, selected Docker client/context, Docker host override, and WSL distro; values are strings. The initial log header shows the client requested at startup; the preflight and final JSON reflect any successful WSL fallback. Each test has `name`, `group`, `service`, `status`, `duration_seconds`, `attempts`, and `message`. For polled checks, `attempts` counts polling cycles (one cycle may probe multiple alternative health endpoints); skipped checks have zero attempts. JSON encoding preserves multiline diagnostics and special characters.

Exit codes are `0` for success, `1` for failed tests, `2` for configuration/report/logging errors, `130` for interrupt, and `143` for termination. The EXIT handler writes partial results after an initialized run is interrupted. Invalid arguments or missing prerequisites detected before output initialization do not produce a report. Output is gitignored.

### Configuration (environment variables)

All URLs have defaults that match the Compose port mappings. Override as needed.

```bash
# JVM Services (Spring Boot)
export SPRING_JVM_TOMCAT_PLATFORM_URL=http://localhost:8080
export SPRING_JVM_TOMCAT_VIRTUAL_URL=http://localhost:8081
export SPRING_JVM_NETTY_URL=http://localhost:8082

# Native Services (Spring Boot native image)
export SPRING_NATIVE_TOMCAT_PLATFORM_URL=http://localhost:8083
export SPRING_NATIVE_TOMCAT_VIRTUAL_URL=http://localhost:8084
export SPRING_NATIVE_NETTY_URL=http://localhost:8085

# Quarkus Services
export QUARKUS_JVM_URL=http://localhost:8086
export QUARKUS_NATIVE_URL=http://localhost:8087

# Micronaut Services
export MICRONAUT_JVM_URL=http://localhost:8088
export MICRONAUT_NATIVE_URL=http://localhost:8089

# Helidon SE Services
export HELIDON_SE_JVM_URL=http://localhost:8090
export HELIDON_SE_NATIVE_URL=http://localhost:8091

# Helidon MP Services
export HELIDON_MP_JVM_URL=http://localhost:8092
export HELIDON_MP_NATIVE_URL=http://localhost:8093

# Spark Services
export SPARK_JVM_PLATFORM_URL=http://localhost:8094
export SPARK_JVM_VIRTUAL_URL=http://localhost:8095

# Javalin Services
export JAVALIN_JVM_PLATFORM_URL=http://localhost:8096
export JAVALIN_JVM_VIRTUAL_URL=http://localhost:8097

# Dropwizard Services
export DROPWIZARD_JVM_PLATFORM_URL=http://localhost:8098
export DROPWIZARD_JVM_VIRTUAL_URL=http://localhost:8099

# Vert.x Services
export VERTX_JVM_URL=http://localhost:8100

# Pekko Services
export PEKKO_JVM_URL=http://localhost:8101

# Go Service
export GO_URL=http://localhost:9080

# Django Services
export DJANGO_PLATFORM_URL=http://localhost:9090
export DJANGO_REACTIVE_URL=http://localhost:9091

# Observability stack
export GRAFANA_URL=http://localhost:3000
export ALLOY_URL=http://localhost:12345
export LOKI_URL=http://localhost:3100
export MIMIR_URL=http://localhost:9009
export TEMPO_URL=http://localhost:3200
export PYROSCOPE_URL=http://localhost:4040

# Orchestration stack
export NEXTJS_URL=http://localhost:3001
export ORCHESTRATOR_URL=http://localhost:3002

# wrk2 readiness + exec smoke test
export WRK2_READY_URL=http://localhost:3003/ready
export WRK2_CONTAINER_NAME=wrk2

bash ./integration-tests/run-integration-tests.sh
```

### Framework Versions

The runner loads and prints framework versions from `compose/.env`:

| Framework       | Version  |
|-----------------|----------|
| Spring Boot     | 4.1.2    |
| Quarkus         | 3.40.1.1 |
| Micronaut       | 5.2.20   |
| Helidon SE & MP | 4.5.6    |
| Spark           | 3.0.5    |
| Javalin         | 7.2.4    |
| Dropwizard      | 5.0.2    |
| Vert.x          | 5.1.7    |
| Pekko           | 1.3.0    |
| Go              | 1.27.3   |
| Django          | 6.1.2    |

## Service Port Mappings

Port mappings match the order in `compose/docker-compose.yml`.

| Service                            | Container Name                | Port | Type               |
|------------------------------------|-------------------------------|------|--------------------|
| Spring Boot JVM Tomcat Platform    | spring-jvm-tomcat-platform    | 8080 | JVM                |
| Spring Boot JVM Tomcat Virtual     | spring-jvm-tomcat-virtual     | 8081 | JVM                |
| Spring Boot JVM Netty              | spring-jvm-netty              | 8082 | JVM                |
| Spring Boot Native Tomcat Platform | spring-native-tomcat-platform | 8083 | Native             |
| Spring Boot Native Tomcat Virtual  | spring-native-tomcat-virtual  | 8084 | Native             |
| Spring Boot Native Netty           | spring-native-netty           | 8085 | Native             |
| Quarkus JVM                        | quarkus-jvm                   | 8086 | JVM                |
| Quarkus Native                     | quarkus-native                | 8087 | Native             |
| Micronaut JVM                      | micronaut-jvm                 | 8088 | JVM                |
| Micronaut Native                   | micronaut-native              | 8089 | Native             |
| Helidon SE JVM                     | helidon-se-jvm                | 8090 | JVM                |
| Helidon SE Native                  | helidon-se-native             | 8091 | Native             |
| Helidon MP JVM                     | helidon-mp-jvm                | 8092 | JVM                |
| Helidon MP Native                  | helidon-mp-native             | 8093 | Native             |
| Spark JVM Platform                 | spark-jvm-platform            | 8094 | JVM                |
| Spark JVM Virtual                  | spark-jvm-virtual             | 8095 | JVM                |
| Javalin JVM Platform               | javalin-jvm-platform          | 8096 | JVM                |
| Javalin JVM Virtual                | javalin-jvm-virtual           | 8097 | JVM                |
| Dropwizard JVM Platform            | dropwizard-jvm-platform       | 8098 | JVM                |
| Dropwizard JVM Virtual             | dropwizard-jvm-virtual        | 8099 | JVM                |
| Vert.x JVM                         | vertx-jvm                     | 8100 | JVM                |
| Pekko JVM                          | pekko-jvm                     | 8101 | JVM                |
| Go                                 | go                            | 9080 | Native (Go binary) |
| Django Platform                    | django-platform               | 9090 | Python (CPython)   |
| Django Reactive                    | django-reactive               | 9091 | Python (CPython)   |

## Telemetry and log assertions

Runtime log checks capture Docker's daemon time **before** sending the request and poll `docker logs --since ... --tail 200`. They inspect all returned lines and merge stdout/stderr in one invocation per attempt. A failed HTTP request fails the test immediately. Old matching lines are excluded, and unrelated lines arriving after the expected line do not hide it. Thread-marker matching is literal and case-insensitive.

Runtime log checks establish a fresh matching entry within the request window. The services do not all log a request ID, so concurrent traffic producing the same marker cannot be distinguished here. Keep benchmarking traffic stopped for these checks.

For each selected service, telemetry tests send one request to its first hello endpoint with `log=true` and a unique sampled `traceparent` header. All selected services are seeded before ingestion polling begins, allowing their exporter/batch delays to overlap. Separate results then poll:

- **Mimir**: [`/prometheus/api/v1/query`](https://grafana.com/docs/mimir/latest/references/http-api/) with a [raw range-vector selector](https://prometheus.io/docs/prometheus/latest/querying/basics/#range-vector-selectors) for the service's `service_name` label. The response retains metric names and actual sample timestamps; Python rejects samples predating the request. This avoids the duplicate-labelset errors caused by applying `timestamp()` across different metric names with otherwise identical labels. This confirms fresh metric export for the service, rather than a particular counter increment.
- **Loki**: [`/loki/api/v1/query_range`](https://grafana.com/docs/loki/latest/reference/loki-http-api/) for fresh service entries containing the endpoint's runtime marker, starting at the request window.
- **Tempo**: [`/api/traces/{traceID}`](https://grafana.com/docs/tempo/latest/api_docs/) for the exact generated trace ID, requiring a fresh span whose resource `service.name` matches the selected service. Sampled trace context propagation must be enabled in that service.

HTTP 200 alone does not pass an ingestion test: empty, malformed, or mismatched JSON fails. Export batching and metric intervals can require a larger `TELEMETRY_TIMEOUT`. Host, service, and backend clocks must be synchronized for telemetry freshness checks. Docker runtime log boundaries use the daemon clock instead of the host clock.

The default Mimir tenant is `anonymous`, matching Alloy's remote-write configuration. Set `MIMIR_TENANT_ID`, `LOKI_TENANT_ID`, or `TEMPO_TENANT_ID` when querying a different tenant. Loki and Tempo omit the tenant header unless configured. Backend URL overrides use `MIMIR_URL`, `LOKI_URL`, and `TEMPO_URL` as below. Pyroscope is covered by readiness, without asserting profile ingestion.

## wrk2 smoke test

After polling `WRK2_READY_URL`, the runner executes:

```bash
docker exec "${WRK2_CONTAINER_NAME:-wrk2}" /wrk2/wrk \
  -t1 -c1 -d3s -R10 --timeout 2s http://127.0.0.1:3003/ready
```

It requires a successful command exit, at least one completed request, `Transfer/sec`, and zero reported non-2xx/3xx responses or socket errors. Captured output is checked once after the command completes. The Docker CLI call is bounded by `DOCKER_TIMEOUT`; disconnecting a timed-out CLI does not guarantee cancellation of the process inside the container, so the workload itself also has a short duration.

## Regression tests

These tests use mocked HTTP/Docker responses and need no running stack:

```bash
python -m unittest discover -s integration-tests -v
bash -n integration-tests/run-integration-tests.sh
```

Coverage includes fallback counting, continued execution after failures, literal content checks, curl errors, fresh-log boundaries, delayed logs, independent Docker/HTTP deadlines, preflight failure aggregation, WSL client selection, explicit Docker overrides, rejection of remote fallback contexts, Windows CRLF handling, raw metric timestamps, overlapped telemetry requests, permanent query errors, wrk2 timeout/error detection, exact filters, partial reports, skipped prerequisites, report JSON escaping, rejection of unapproved Bash executables, and literal filesystem paths containing apostrophes.

The Python regression harness selects Bash only from fixed installation paths: `C:/Program Files/Git/usr/bin/bash.exe` on Windows, or `/bin/bash` then `/usr/bin/bash` on Unix (including WSL). It does not search PATH. `BASH_TEST_BINARY` may select an exact path from the current platform's list; arbitrary executables and command strings raise a configuration error before launch. If no selected installation exists, Bash-dependent tests are skipped. These installation locations and the local test environment must be trusted; this harness is not a sandbox for untrusted test code.

## Troubleshooting

- Start the containers needed by the chosen groups. Use filters for partial stacks.
- Check curl's recorded error for DNS failures, connection refusal, or timeouts. Increase startup/request deadlines for a slow host.
- For Docker failures, verify the client/context printed by the preflight. In WSL, compare `docker version` with `docker.exe --context desktop-linux version`; a missing Linux socket with a working Windows CLI indicates the distro's Docker connection differs from Windows. Enable Docker Desktop's WSL Integration, use the automatic local fallback, or set `DOCKER_BIN` explicitly. Check any explicit `DOCKER_HOST`/`DOCKER_CONTEXT` overrides and container names in `services.txt`.
- For log failures, inspect `docker logs --tail 50 <service>` and verify that `?log=true` emits the configured marker.
- For ingestion failures, inspect Alloy exporter errors, service telemetry settings, backend tenant/URL configuration, and the generated trace ID in the failed Tempo URL. A healthy backend can still have an ingestion failure.
- Archive both `.log` and `.json` artifacts in CI, including failed runs.

## Additional resources

- [Main testing guide](../docs/TESTING.md)
- [Docker Compose configuration](../compose/docker-compose.yml)
- [Service READMEs](../services/README.md)
