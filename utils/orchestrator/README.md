# Orchestrator (Quarkus) — local Docker Compose runner

This service is designed for **local testing**. It runs inside Docker, mounts:

- your repo/workspace at `/workspace`
- the host Docker socket at `/var/run/docker.sock`

and exposes a small HTTP API to run **restricted** `docker compose ...` commands and stream their output via **SSE**.

## Endpoints

- `GET /q/health/ready` — basic health (simple JSON)
- `GET /v1/jobs/{id}` — job status
- `GET /v1/jobs/{id}/events` — Server-Sent Events stream of job output
- `GET /v1/commands` — preset of docker commands
- `POST /v1/run` — submit a command (restricted allowlist)

Swagger UI:
- http://localhost:3002/q/swagger-ui/

Health UI:
- http://localhost:3002/q/health-ui/

> Swagger UI is always included (also in prod mode) via `quarkus.swagger-ui.always-include=true`.

## Quick start (Docker)

Build the orchestrator image:

```bash
docker build -t local/orchestrator-quarkus:dev .
```

Start the orchestrator container:

```bash
docker compose --project-directory compose up orchestrator --no-recreate -d
```

Test:

```bash
curl http://localhost:3002/q/health/ready
```

Run a compose command (example):

```bash
curl -X POST http://localhost:3002/v1/run \
  -H "content-type: application/json" \
  -H "authorization: Bearer change-me" \
  -d '{"command":"docker compose --project-directory /workspace/compose --profile=OBS up -d"}'
```

Stream the job output:

```bash
curl -N http://localhost:3002/v1/jobs/<JOB_ID>/events \
  -H "authorization: Bearer change-me"
```

## Notes on logs & Grafana Alloy

- The **stdout/stderr output** of the executed `docker compose ...` command is:
  1) streamed back to clients via SSE, and
  2) logged by the orchestrator to its own stdout (so Alloy can scrape it as container logs).

For **container runtime logs** (services you started with compose), Alloy should scrape logs directly from Docker. This is the simplest, most reliable approach.
