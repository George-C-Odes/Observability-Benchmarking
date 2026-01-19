# Orchestrator (Quarkus) — local Docker Compose runner

This service is a small **control plane** for the repo’s Docker Compose environment.

It’s designed for **local benchmarking automation**: it runs inside Docker and exposes a small HTTP API to run **restricted** `docker compose ...` commands and stream their output via **Server-Sent Events (SSE)**.

> Source code is the source of truth. This README documents the current implementation in `utils/orchestrator`.

## Why it exists (the design reasoning)

Running repeatable benchmarks quickly usually needs a “traffic cone” between a UI/script and your host Docker engine:

- You want a **single place** that knows how to start/stop the stack.
- You want a safe way to run only a **small allowlist** of commands (not arbitrary shell).
- You want a real-time channel (SSE) so the UI can show progress without polling.

The orchestrator provides that boundary.

It also keeps the Next.js dashboard as a **presentation layer**: the dashboard proxies calls for convenience, but the orchestration logic stays here.

## Where it fits

High-level flow:

- Browser → Next.js dashboard (`utils/nextjs-dash`) → Orchestrator
- Or: CLI/client → Orchestrator (direct)

The orchestrator then drives:

- `docker compose ...` against the repo’s `compose/` project
- Health aggregation across the running stack
- Reads/writes the environment file used by compose

## What it does

- Runs a validated, allowlisted Docker command (via `POST /v1/run`).
- Creates an async job and streams output/events over SSE.
- Aggregates health checks for the rest of the stack (via `GET /v1/health`).
- Manages a workspace `.env` (via `/v1/env`).

## Job lifecycle (how SSE works here)

A “run” request creates a job. You then watch it in two ways:

1. **Snapshot**: `GET /v1/jobs/{id}` gives status + latest known state.
2. **Stream**: `GET /v1/jobs/{id}/events` emits events as they happen.

The event stream includes:

- command start
- stdout/stderr lines
- heartbeat events (so UIs can detect a dead stream)
- command exit (success/failure)

The Next.js dashboard consumes this API (often via a proxy route) to power the Script Runner UI.

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

### Windows / WSL2 note (paths)

On Windows + Docker Desktop (WSL2 backend), path translation is the #1 source of startup issues.

If you see bind-mount errors or “file not found” issues when running compose commands from the orchestrator, verify:

- `HOST_REPO` is correct in `compose/.env`
- `orchestrator.project-paths.*` points to the correct host-side compose directory

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

## Using the orchestrator via the dashboard

If you start the dashboard, you normally don’t need to call orchestrator endpoints manually.

- Dashboard URL: http://localhost:3001
- It will:
  - read/edit the env file through the orchestrator
  - submit commands and stream events to show progress

## Troubleshooting

### 1) 401 Unauthorized

- Confirm you’re sending `Authorization: Bearer <api-key>`.
- Confirm the configured key matches `orchestrator.api-key`.

### 2) SSE stream disconnects

- Long-running compose commands can exceed client/proxy timeouts.
- Prefer using the dashboard defaults (it’s configured for long event streams), or increase any reverse-proxy timeouts if you add one.

### 3) Docker socket permission errors

- Confirm the orchestrator container has `/var/run/docker.sock` mounted.
- Confirm Docker Desktop is running.

### 4) Compose bind-mount problems

- Re-check `HOST_REPO` in `compose/.env`.
- On Windows, ensure the directory is shared with Docker Desktop.

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
