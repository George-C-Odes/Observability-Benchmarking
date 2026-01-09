# Observability Benchmarking Dashboard

A Next.js-based dashboard UI for orchestrating and managing the Observability Benchmarking environment.

## Architecture (high-level)

### Today (MVP)

**Browser UI (Next.js / MUI)** → **Thin Next.js API proxy** → **Orchestrator service (Quarkus)**

- UI components live under `app/components/*`.
- Next.js should remain a *presentation layer*.
  - It exposes `/api/*` routes for accessing the orchestrator and avoids CORS complexity.
  - These routes should be **thin proxies** and avoid business rules.
- The orchestration / business logic belongs in the **Quarkus orchestrator**.

### Future vision

#### Mobile app

- The mobile app will have **zero interaction with Next.js**.
- The mobile app will talk **directly to the Quarkus orchestrator**.

#### Authentication & roles

- Authentication/authorization will be based on **Keycloak (OIDC)**.
- Authorization decisions should be enforced in the **orchestrator** (RBAC), not in Next.js.

## MVPs implemented now

- Standardized backend logging with per-request correlation ids (requestId) and stable UI rendering.
- Refactored complex UI into hooks + components to improve testability.
- Added unit tests for core hooks and Logs UI.
- Reduced Next.js "business logic" (validation rules) in API routes in favor of orchestrator ownership.

## Features

- **Environment Configuration Editor**: Edit the `compose/.env` file through an intuitive UI
- **Script Runner**: Execute run presets via the orchestrator
- **Application Logs**: Client console + buffered Next.js server logs for local/dev troubleshooting
- **Professional UI**: Built with Material-UI for a polished interface
- **Docker Support**: Runs in its own containerized environment

## Technology Stack

- **Next.js**: v16.1.1
- **React**: v19.2.3
- **Material-UI (MUI)**: v7.3.7
- **TypeScript**: v5
- **Node.js**: v25

## Configuration

Environment variables (provided to the **Next.js container** via docker-compose):

- `ORCH_URL` (server-to-server URL, e.g. `http://orchestrator:3002`)
- `ORCH_API_KEY`

## Runtime endpoints

Next.js local endpoints used by the browser:

- Next.js app health: `GET /api/app-health`
- Next.js logs (snapshot): `GET /api/logs`
- Next.js logs (live SSE): `GET /api/logs/stream`
- Aggregated service health proxy: `GET /api/health`
- Env proxy: `GET/POST /api/env`
- Orchestrator proxy: `POST /api/orchestrator/submit`, `GET /api/orchestrator/status`, `GET /api/orchestrator/events`

Orchestrator (Quarkus) endpoints used by the router:

- Commands: `GET /v1/commands`
- Run a command: `POST /v1/run` (requires Authorization)
- Job status: `GET /v1/jobs/{id}`
- Job events (SSE): `GET /v1/jobs/{id}/events`
- Env file: `GET/POST /v1/env` (POST requires Authorization)
- Aggregated service health: `GET /v1/health`

## Development

### Prerequisites

- Node.js 22 or higher
- npm or yarn

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3001](http://localhost:3001) in your browser

### Quality gates

```bash
npm run lint
npm run typecheck
npm test
```

Quick One liner:
```bash
npm -s run lint ; npm -s run typecheck ; npm -s test ; npm -s run build
```

### Building for Production

```bash
npm run build
npm start
```

## Docker Deployment

The dashboard is designed to run in a Docker container alongside the observability stack.

**Note**: Due to npm ci timeout issues in resource-constrained CI environments, it's recommended to build locally first or use the development mode.

### Option 1: Use Docker Compose (Recommended for local development)

The dashboard service is already configured in `compose/docker-compose.yml` and will start with the OBS profile:

```bash
docker compose --project-directory compose up nextjs-dash --build -d
```

Access the dashboard at [http://localhost:3001](http://localhost:3001)

### Option 2: Build the Docker image manually:

```bash
docker buildx build --load -t nextjs-dash:latest -f utils/nextjs-dash/Dockerfile utils\nextjs-dash
```

### Option 3: Run the container:

```bash
docker run -p 3001:3001 \
  -v $(pwd)/../compose/.env:/app/compose/.env \
  -v $(pwd)/../.run:/app/.run \
  nextjs-dash:latest
```

## Future roadmap (overview)

### When mobile comes into play

- Orchestrator exposes all required endpoints directly (OpenAPI-first).
- Build a dedicated TypeScript client (and later mobile-native clients) that talk to the orchestrator.
- Harden real-time channels (SSE reconnect support, Last-Event-ID, heartbeats).

### When auth & roles come into play

- Integrate Keycloak in orchestrator.
- Enforce RBAC at orchestrator endpoints.
- Add audit events: who ran what, who changed env, who canceled jobs.

## License

Apache License 2.0 (same as parent project)
