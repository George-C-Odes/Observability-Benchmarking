---
layout: default
title: Control Plane (Dashboard + Orchestrator)
permalink: /docs/control-plane
---

# Control Plane (Dashboard + Orchestrator)

This repository includes a “control plane” layer to make local benchmarking workflows fast, repeatable, and observable.

It consists of:

- **Dashboard**: Next.js UI (`utils/nextjs-dash`) on port **3001**
- **Orchestrator**: Quarkus service (`utils/orchestrator`) on port **3002**

Last updated: **2026-01-19**

## Why a control plane exists

Benchmarking isn’t just “start service → run wrk2”. In practice you iterate repeatedly:

- tweak `compose/.env`
- start/stop selected profiles (OBS / SERVICES / RAIN_FIRE)
- rerun load generation
- verify health + capture logs

The control plane exists to make that loop:

- faster (UI + presets)
- safer (command allowlist)
- easier to observe (job state + SSE output)

## Architecture

High-level flow:

```
Browser
  → nextjs-dash (Next.js)
    → /api/* proxy routes
      → orchestrator (Quarkus)
        → docker compose ... (host engine via docker socket)
```

### Key principle: keep Next.js “thin”

The Next.js dashboard should remain a presentation layer.

- It proxies requests to avoid CORS issues.
- It should not contain orchestration business rules.

The orchestrator owns:

- validation / allowlisting
- job lifecycle
- streaming output/events

## What you can do with it

### 1) Edit environment configuration

The dashboard exposes a UI to view/edit the environment file used by Compose (`compose/.env`).

- The orchestrator persists the file
- A backup is created on update

### 2) Run curated command presets

The orchestrator exposes an allowlisted “run” API.

The dashboard can submit:

- “start OBS”
- “start SERVICES”
- “rerun RAIN_FIRE”

Depending on repo configuration, it may also expose IntelliJ `.run` presets.

### 3) Stream progress (SSE)

Long-running tasks (builds, start/stop, reruns) report progress via Server-Sent Events.

This gives a low-friction, browser-native “tail -f” experience.

### 4) Health aggregation

The orchestrator can aggregate health/readiness across the stack so you can quickly verify:

- who is up
- who is ready
- who is failing

## How to use it

### Option A: Use the dashboard (recommended)

1. Start the stack (at least the control plane services) using the repository’s compose workflow.
2. Open the dashboard:

- http://localhost:3001

From there:

- edit env values
- run presets
- follow job output via SSE

### Option B: Call orchestrator directly

Orchestrator API base:

- http://localhost:3002

Useful endpoints:

- Swagger UI: `/q/swagger-ui/`
- Run a job: `POST /v1/run` (requires `Authorization: Bearer <api-key>`)
- Job events (SSE): `GET /v1/jobs/{id}/events`

See also:

- `utils/orchestrator/README.md`
- `utils/nextjs-dash/README.md`

## “Gotchas” (especially on Windows + WSL2)

- `HOST_REPO` in `compose/.env` must be correct (bind mounts depend on it).
- Docker Desktop must have access to the repo directory.
- SSE can be impacted by reverse proxies or aggressive corporate network middleware.

## Security note

The orchestrator commonly mounts the Docker socket and can control the host Docker engine.

Treat it as privileged and do not expose it publicly.

---

## Screenshots (control plane UI)

### Dashboard hub

![Next.js dashboard: hub]({{ '/images/screenshots/nextjs-dash/project_hub.png' | relative_url }})

### Environment configuration editor

![Next.js dashboard: environment configuration]({{ '/images/screenshots/nextjs-dash/environment_config.png' | relative_url }})

### Running scripts and following output

![Next.js dashboard: script runner (1)]({{ '/images/screenshots/nextjs-dash/script_runner_1.png' | relative_url }})

![Next.js dashboard: script runner (2)]({{ '/images/screenshots/nextjs-dash/script_runner_2.png' | relative_url }})

### Service health overview

![Next.js dashboard: service health (1)]({{ '/images/screenshots/nextjs-dash/service_health_1.png' | relative_url }})

![Next.js dashboard: service health (2)]({{ '/images/screenshots/nextjs-dash/service_health_2.png' | relative_url }})
