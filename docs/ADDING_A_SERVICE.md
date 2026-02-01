---
layout: default
title: Adding a New Service (Legacy)
permalink: /docs/adding-a-service-legacy
---

# Adding a New Service

This guide explains how to add a new benchmark target to the repository (a new REST service implementation) and make it show up in the existing environment:

- Docker Compose orchestration (`compose/`)
- Control-plane tooling (dashboard + orchestrator under `utils/`)
- Load generation (wrk2 under `utils/wrk2/`)
- Documentation and results tracking (`docs/` and `results/`)

> Important: this page documents the integration points. It intentionally does not modify `compose/`, `services/`, or `utils/`.

## Contract (what a “service” must provide)

At minimum, a new service should:

1. Expose a stable HTTP endpoint you can benchmark.
   - For comparability with existing targets, aim to implement:
     - `GET /hello/platform`

2. Export telemetry under the same OTel pipeline where possible:
   - metrics
   - traces
   - logs
   - (optional) profiling

3. Be buildable and runnable via Docker.

4. Identify itself consistently:
   - container/service name in Docker Compose
   - `service.name` (OpenTelemetry resource attribute)
   - Grafana labels for logs/metrics/traces

## Step-by-step integration checklist

### 1) Add the implementation under `services/`

Create a new folder under `services/` that includes:

- Docker build context (Dockerfile + build assets)
- Source code
- A small README describing:
  - how the endpoint behaves
  - how observability is configured
  - any runtime flags

Keep the endpoint and response shape consistent with other implementations so that wrk2 scripts and dashboards remain comparable.

### 2) Wire it into Docker Compose (`compose/`)

Add a new Compose service for your implementation:

- Put it under the `SERVICES` profile.
- Ensure it has deterministic resource constraints (CPU limit / memory limit) consistent with other services.
- Ensure it can reach the OTLP endpoint (Alloy) and uses the same network as the rest of the stack.

Also add (or update) a matching load generator entry (usually under the `RAIN_FIRE` profile) that points wrk2 at your new service.

### 3) Make sure telemetry lands in the right places

To show up in Grafana consistently, your service should propagate:

- Metrics → Mimir/Prometheus datasource
- Traces → Tempo datasource
- Logs → Loki datasource
- Profiles → Pyroscope datasource (optional)

If you’re using OpenTelemetry, confirm:

- `service.name` is set (and stable)
- you can filter by it across Grafana Explore (logs and traces)

### 4) Update load generation (wrk2)

A good baseline is:

- deterministic constant-throughput mode
- fixed duration
- fixed connections and threads

If you add a new service, ensure:

- there is an explicit target URL for it in the wrk2 tooling
- the request path matches your service’s endpoint

### 5) Add dashboards (optional but recommended)

If you want your service to be “first-class” in Grafana:

- add a service-specific dashboard panel group
- ensure it’s queryable by `service_name` / `service.name`

Keep dashboard naming consistent so it’s easy to compare services.

### 6) Document the new service

Update documentation as follows:

- `README.md`: add it to the “REST Service Implementations” list.
- `docs/tools-technologies.md`: add a section under Application Frameworks.
- `docs/benchmarking.md`: include it in the “at-a-glance results” table once you have numbers.

### 7) Capture results in `results/`

For every published run, create a run folder under `results/benchmarks/…`.

Include:

- wrk2 raw outputs
- a `summary.md` explaining what changed vs previous runs
- environment metadata (host, versions, parameters)

See: `results/README.md`.

## Touchpoints map (where things usually need changes)

| Concern                        | Folder(s)                                   | What you update                        |
|--------------------------------|---------------------------------------------|----------------------------------------|
| Add a new benchmark target     | `services/`                                 | Source + Docker build context          |
| Start/stop the target          | `compose/`                                  | New Compose service under `SERVICES`   |
| Load generator target wiring   | `compose/`, `utils/wrk2/`                   | New wrk2 target and/or container       |
| Control-plane integration      | `utils/nextjs-dash/`, `utils/orchestrator/` | UI actions and orchestration endpoints |
| Observability pipeline routing | `config/alloy/`, `config/grafana/`          | OTLP pipeline and dashboards           |
| Published results              | `results/`                                  | Run artifacts and summary              |
| Public docs                    | `README.md`, `docs/`                        | Narrative + instructions               |

## Common pitfalls

- **Non-equivalent observability**: If one service sends fewer signals (or no tracing/logs), its RPS will look better but the comparison isn’t fair.
- **Different endpoints**: If request path/logic differs, you’re benchmarking different work.
- **Missing `service.name`**: Makes Grafana correlation and filtering painful.
- **Parallel native builds**: Native-image builds can exhaust Docker Desktop resources; prefer `COMPOSE_PARALLEL_LIMIT=1`.
