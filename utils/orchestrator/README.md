# Orchestrator (Quarkus) — local Docker Compose runner

This service is designed for **local testing** and developer automation.
It runs inside Docker and exposes a small HTTP API to run **restricted** `docker compose ...` commands and stream their output via **SSE**.

> Source code is the source of truth. This README documents the current implementation in `utils/orchestrator`.

## What it does

- Runs a validated, allowlisted Docker command (via `POST /v1/run`).
- Creates an async job and streams output/events over SSE.
- Aggregates health checks for the rest of the stack (via `GET /v1/health`).
- Manages a workspace `.env` (via `/v1/env`).

## Security model (important)

- `POST /v1/run` is protected with a bearer token requirement (`Authorization: Bearer <api-key>`).
- `POST /v1/env` is also protected.
- The API key is configured via `orchestrator.api-key` (defaults to `change-me`).

Because this service can control Docker on the host (it typically mounts `/var/run/docker.sock`), **treat it as privileged**.
Do not expose it to untrusted networks.

## Endpoints (current)

### Jobs

- `POST /v1/run` — submit a validated command
- `GET /v1/jobs/{id}` — job status snapshot
- `GET /v1/jobs/{id}/events` — Server-Sent Events stream of job events

Optional query param:
- `runId` can be used as a client-side correlation key. When a job is created with a `runId`, subsequent status/event calls should pass the same `runId`.

### Presets

- `GET /v1/commands` — list preset commands discovered from IntelliJ `.run` XML files

### Health aggregation

- `GET /v1/health` — aggregated health/readiness of configured services
  - optional query param `service=<name>` to filter to a single service

### Environment file management

- `GET /v1/env` — return `{ content, path }` for the configured env file
- `POST /v1/env` — update env file content (creates a backup)

### Quarkus built-ins

- `GET /q/health/ready` — Quarkus readiness

Swagger UI:
- http://localhost:3002/q/swagger-ui/

Health UI:
- http://localhost:3002/q/health-ui/

> Swagger UI is always included (also in prod mode) via `quarkus.swagger-ui.always-include=true`.

## Runtime assumptions

Typical container runtime setup (see the compose files in the repo):

- repo/workspace mounted at `/workspace`
- Docker socket mounted at `/var/run/docker.sock`

The orchestrator uses the host Docker engine through the socket. That means bind mount source paths must be valid on the **host**.
For Windows/macOS, this often requires configuring host paths in `orchestrator.project-paths.host-compose`.

## Configuration highlights

Configuration lives in `src/main/resources/application.yml`.
Common keys:

- `orchestrator.api-key`
- `orchestrator.max-buffer-lines`
- `orchestrator.heartbeat.interval-ms`
- `orchestrator.project-paths.*` (workspace + compose + env)
- `orchestrator.health.*` (service health aggregation)

## Quick start (Docker)

Build the orchestrator image:

```bash
docker build -t local/orchestrator-quarkus:dev .
```

Start the orchestrator container (from the repository root):

```bash
docker compose --project-directory compose up orchestrator --no-recreate -d
```

Test readiness:

```bash
curl http://localhost:3002/q/health/ready
```

Run a docker compose command (example):

```bash
curl -X POST http://localhost:3002/v1/run \
  -H "content-type: application/json" \
  -H "authorization: Bearer change-me" \
  -d '{"command":"docker compose --project-directory /workspace/compose --profile=OBS up -d","runId":"run-1"}'
```

Stream the job output:

```bash
curl -N "http://localhost:3002/v1/jobs/<JOB_ID>/events?runId=run-1" \
  -H "authorization: Bearer change-me"
```

Check stack health aggregation:

```bash
curl "http://localhost:3002/v1/health"
```

## Notes on logs & Grafana Alloy

- The **stdout/stderr output** of the executed command is:
  1) streamed back to clients via SSE, and
  2) logged by the orchestrator to its own stdout (so Alloy can scrape it as container logs).

For **container runtime logs** (services started by compose), Alloy should scrape logs directly from Docker.

## Production-grade notes

This module is intentionally optimized for local/dev use.
If you want to run it beyond localhost, consider:

- disabling or strongly restricting Docker socket access
- running behind an authenticated reverse proxy
- tightening the command allowlist and workspace path configuration
- adding rate limiting and audit logging
