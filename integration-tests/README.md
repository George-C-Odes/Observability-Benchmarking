# Integration Tests

> Comprehensive integration tests for verifying deployment setup and observability mechanisms for all JVM and Native services.

## Overview

This directory contains an integration test runner script (`run-integration-tests.sh`) that validates:

- **Service deployment**: All JVM-based services and native services respond on expected endpoints
- **Observability stack readiness**: Grafana, Alloy, Loki, Mimir, Tempo, Pyroscope are reachable
- **Basic metrics/health endpoints**: Verifies each service exposes at least one expected metrics/health endpoint
- **Trace generation smoke test**: Sends a request to each service and verifies a known substring appears in the container logs
- **Resilience**: The suite keeps running even if individual tests fail (it prints a summary at the end)

> Note: The runner assumes the Docker Compose stack is already up. It does not start containers.

## Quick Start

### Prerequisites

1. **Docker & Docker Compose**
```bash
  docker --version      # Requires 20.10+
  docker compose version # Requires 2.0+
```

2. **Command-line Tools**
```bash
  curl --version        # Requires curl
  bash --version        # Requires 4.0+
```

3. **Port Availability (defaults)**
   - 8080-8093, 9080: service ports
   - 3000: Grafana
   - 3001: NextJS UI
   - 3002: Orchestrator
   - 3003: wrk2 readiness endpoint

### Running Tests

Run from the root directory of this repo.

> Note: The test runner assumes the Docker Compose stack is already up. It does not start containers by itself.

1. Set wrk2 to not autostart benchmarking (prevent skewing tests) and start everything via Docker Compose

    ```powerShell
    #powershell
    $env:WRK_AUTORUN="false"; docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate -d
    ```
    or
    ```bash
    #bash
    WRK_AUTORUN=false docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate -d
    ```

2. Wait for services to initialize (less than a minute if everything was pre-built / cached)
   * For some reason Loki, Tempo and Pyroscope might need additional probe(s) after boot to reply with 200

3. Run integration tests
```bash
bash ./integration-tests/run-integration-tests.sh
```

Each run writes a timestamped log file to:

- `integration-tests/output/YYYYMMDD_HHmmss.log`

The `integration-tests/output/` directory is intentionally gitignored (it’s per-run output).

## Test Script

### Features

- **Colored output**: Blue section headers, Green (✓) for pass, Red (✗) for fail
- **Exit codes**: 0 when all tests pass; 1 when any test fails
- **Configurable**: Override service URLs via environment variables
- **Run logging**: Saves everything (stdout+stderr) to `integration-tests/output/`
- **wrk2 smoke checks**: Verifies wrk2 `/ready` and that `docker exec` wrk2 can run a tiny load test
- **Trace generation (smoke)**: Sends `?log=true` requests, then checks one expected substring in the *last* container log line

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

# Spark Services
export SPARK_JVM_PLATFORM_URL=http://localhost:8088
export SPARK_JVM_VIRTUAL_URL=http://localhost:8089

# Javalin Services
export JAVALIN_JVM_PLATFORM_URL=http://localhost:8090
export JAVALIN_JVM_VIRTUAL_URL=http://localhost:8091

# Micronaut Services
export MICRONAUT_JVM_URL=http://localhost:8092
export MICRONAUT_NATIVE_URL=http://localhost:8093

# Go Service
export GO_URL=http://localhost:9080

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

The runner prints the versions it is designed against (these values are embedded in the script):

| Framework   | Version |
|-------------|---------|
| Spring Boot | 4.0.3   |
| Quarkus     | 3.31.4  |
| Spark       | 3.0.3   |
| Javalin     | 6.7.0   |
| Micronaut   | 4.10.15 |
| Go          | 1.26.0  |

## Service Port Mappings

Port mappings match the order in `compose/docker-compose.yml`.

| Service                            | Container Name                | Port | Type               |
|------------------------------------|-------------------------------|------|--------------------|
| Spring Boot Tomcat Platform        | spring-jvm-tomcat-platform    | 8080 | JVM                |
| Spring Boot Tomcat Virtual         | spring-jvm-tomcat-virtual     | 8081 | JVM                |
| Spring Boot Netty                  | spring-jvm-netty              | 8082 | JVM                |
| Spring Boot Native Tomcat Platform | spring-native-tomcat-platform | 8083 | Native             |
| Spring Boot Native Tomcat Virtual  | spring-native-tomcat-virtual  | 8084 | Native             |
| Spring Boot Native Netty           | spring-native-netty           | 8085 | Native             |
| Quarkus JVM                        | quarkus-jvm                   | 8086 | JVM                |
| Quarkus Native                     | quarkus-native                | 8087 | Native             |
| Spark JVM Platform                 | spark-jvm-platform            | 8088 | JVM                |
| Spark JVM Virtual                  | spark-jvm-virtual             | 8089 | JVM                |
| Javalin JVM Platform               | javalin-jvm-platform          | 8090 | JVM                |
| Javalin JVM Virtual                | javalin-jvm-virtual           | 8091 | JVM                |
| Micronaut JVM                      | micronaut-jvm                 | 8092 | JVM                |
| Micronaut Native                   | micronaut-native              | 8093 | Native             |
| Go                                 | go                            | 9080 | Native (Go binary) |

## What’s Tested (by the runner)

### Deployment endpoints

The runner checks these endpoints and response substrings:

- **Spring Boot (JVM + Native)**
  - `/hello/platform` contains `Boot`
  - `/hello/virtual` contains `Boot`
  - `/hello/reactive` contains `Boot`

- **Quarkus (JVM + Native)**
  - `/hello/platform` contains `Quarkus`
  - `/hello/virtual` contains `Quarkus`
  - `/hello/reactive` contains `Quarkus`

- **Spark**
  - `/hello/platform` or `/hello/virtual` contains `Spark`
  - readiness: `/ready` returns 200

- **Javalin**
  - `/hello/platform` or `/hello/virtual` contains `Javalin`
  - readiness: `/ready` returns 200

- **Micronaut**
  - `/hello/platform`, `/hello/virtual`, `/hello/reactive` contains `Micronaut`
  - `/health` returns 200

- **Go**
  - `/hello/virtual` contains `GO`

### Metrics / readiness / health checks

The runner is intentionally tolerant and will accept **any one** of these endpoints per framework:

- **Spring Boot services**
  - `/actuator/metrics` OR
  - `/actuator/health/readiness` OR
  - `/actuator/health/liveness`

- **Quarkus services**
  - `/q/metrics/json` OR
  - `/q/health/ready` OR
  - `/q/health/live`

- **Micronaut**
  - `/metrics` OR
  - `/health`

- **Go**
  - `/healthz` OR
  - `/readyz` OR
  - `/livez`

- **Spark / Javalin**
  - readiness: `/ready`

### Observability stack readiness

The runner checks:

- Grafana: `${GRAFANA_URL}/api/health`
- Alloy: `${ALLOY_URL}/-/ready`
- Loki: `${LOKI_URL}/ready`
- Mimir: `${MIMIR_URL}/ready`
- Tempo: `${TEMPO_URL}/ready`
- Pyroscope: `${PYROSCOPE_URL}/ready`

### Orchestration stack readiness

The runner checks:

- NextJS UI: `${NEXTJS_URL}/api/app-health`
- Orchestrator: `${ORCHESTRATOR_URL}/q/health/ready`
- Orchestrator aggregated services health check: `${ORCHESTRATOR_URL}/v1/health`

### wrk2 readiness + on-demand exec

The runner:

1. Polls `WRK2_READY_URL` until it returns HTTP 200 (2 second timeout).
2. Runs a tiny self-check command inside the wrk2 container:
   - `docker exec ${WRK2_CONTAINER_NAME} /wrk2/wrk -t1 -c1 -d1s -R1 --timeout 3s http://0.0.0.0:3003/ready`
3. The test passes only if the output contains `Transfer/sec`.

### Trace generation (smoke test via container logs)

For each service endpoint, the runner:

- calls: `GET {endpoint}?log=true`
- waits briefly, then checks the *last log line* of the service container via `docker logs --tail 1 ...`
- expects a known substring (case-insensitive)

Example expectations (not exhaustive):

- Spring Tomcat platform expects `http-nio`
- Spring virtual expects `VirtualThread`
- Spring Netty expects `reactor-http`
- Quarkus expects `executor-thread` / `vthread` / `vert.x-eventloop-thread`
- Spark/Javalin/Micronaut virtual vs platform checks expect `isVirtual: 'true'` / `isVirtual: 'false'`
- Go expects `goroutine`

This is a **smoke test** for “a request caused a log line with the expected threading/runtime markers”. It does *not* query Tempo directly.

## Troubleshooting

### “Connection refused” / timeouts

- The runner’s curl timeout is short (`--max-time 2`). If a container is still starting, rerun after a brief wait.
- Confirm individual endpoints:
  - `http://localhost:8080/hello/platform`
  - `http://localhost:8086/hello/platform`
  - `http://localhost:3000/api/health`

### wrk2 exec failures

The wrk2 checks require:

- the wrk2 container to exist (default name: `wrk2`)
- Docker CLI access (so `docker exec` works)
- the wrk2 container image to contain `/wrk2/wrk`

### Trace log checks failing

The trace smoke tests depend on:

- container names matching the Compose service container names listed above
- the service writing a log line for `?log=true` requests
- the expected substring being present in the *last* log line

If you see failures, inspect the full container logs:

- `docker logs --tail 50 spring-jvm-tomcat-platform`
- `docker logs --tail 50 quarkus-jvm`

## CI/CD Integration

The runner exits non-zero on failures, so it’s friendly for CI.

Example GitHub Actions step (illustrative):

- start Compose services
- wait briefly
- run `bash ./integration-tests/run-integration-tests.sh`
- collect Compose logs on failure

## Additional Resources

- [Main Testing Guide](../docs/TESTING.md)
- [Docker Compose Configuration](../compose/docker-compose.yml)
- [Service READMEs](../services/README.md)

---

**Last Updated**: February 2026
