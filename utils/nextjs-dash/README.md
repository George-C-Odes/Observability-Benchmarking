# Observability Benchmarking Dashboard

A Next.js-based dashboard UI for orchestrating and managing the Observability Benchmarking environment.

## Why it exists (the design reasoning)

Benchmarking workflows are repetitive:

- edit the same `compose/.env` values
- start/stop specific profiles and services
- rerun load generation
- watch logs and verify the stack is healthy

You *can* do all of this from a terminal, but the dashboard provides a faster “control plane” loop:

- A UI for editing the env file safely
- A UI for running curated command presets
- A single place to view buffered client and server logs

Just as important: this dashboard is intentionally a **presentation layer**.

- It avoids owning orchestration business logic.
- It proxies to the orchestrator to reduce CORS friction.

## How it fits (high level)

Browser UI (Next.js / MUI) → Next.js API proxy (`/api/*`) → Orchestrator service (Quarkus)

- UI components live under `app/components/*`, with domain sub-directories (e.g. `service-health/`, `scripts/`, `ui/`).
- Reusable hooks live under `app/hooks/*`.
- Next.js should remain a *presentation layer*.
  - It exposes `/api/*` routes for accessing the orchestrator and avoids CORS complexity.
  - These routes should be **thin proxies** and avoid business rules.
- The orchestration / business logic belongs in the **Quarkus orchestrator**.

## What you can do with it

Common workflows:

1. **Edit environment configuration**
   - Update values in `compose/.env` (for example: load generator targets, rates, enabled services).
   - Save changes; the orchestrator persists the file (with a backup).

2. **Configure benchmark targets**
   - Select which service endpoints to include in the benchmark run via a chip-based multiselect UI.
   - Quick-filter buttons for grouped selection (Java, JVM, Native, Spring, Helidon, Python, Go, Platform, Virtual, Reactive, All, None).
   - Changes are saved to `config/benchmark-targets.txt` and take effect on the next wrk2 run.

3. **Run command presets**
   - Start only the observability stack (OBS)
   - Start stack + services
   - Rerun load generators (RAIN_FIRE)
   - Any other allowlisted preset commands (discovered from `.run/` configs)

4. **Watch operational logs**
   - Browser/client logs (captured from `console.*`)
   - Next.js server logs (buffered and streamable)

## Usage (recommended)

### Option A: Run via Docker Compose (the normal path)

The dashboard service is configured in the repository’s compose project.

Once the stack is running, open:

- http://localhost:3001

### Option B: Local dev (Node)

This is best when working on the UI itself.

Prereqs:

- Node.js 22+
- npm

```bash
npm install
npm run dev
```

Then open:

- http://localhost:3001

> Note: local dev still requires the orchestrator to be reachable, because the dashboard proxies orchestration.

## Troubleshooting

### The dashboard loads but actions fail

- Confirm the orchestrator is running and reachable.
- Ensure the dashboard container has correct env vars:
  - `ORCH_URL` (server-to-server URL)
  - `ORCH_API_KEY`

### SSE streams stop early

Some environments terminate long-lived HTTP connections.

- Prefer using the compose-launched dashboard (it’s tuned for long streams).
- If you put a reverse proxy in front, increase its SSE/idle timeout.

### Env editing appears to “do nothing”

- Verify `HOST_REPO` is correctly set in `compose/.env`.
- Ensure Docker Desktop has access to the repo directory (Windows/macOS file sharing).

## Architecture (high-level)

### Today (MVP)

**Browser UI (Next.js / MUI)** → **Thin Next.js API proxy** → **Orchestrator service (Quarkus)**

- UI components live under `app/components/*`.
  - Domain sub-directories group related pieces (e.g. `service-health/`, `scripts/`, `ui/`).
  - Tab content components are lazy-loaded (`React.lazy`) and mounted on first visit to keep initial load fast.
- Reusable hooks live under `app/hooks/*`.
  - Runtime-config hooks are created via a generic factory (`useRuntimeConfig.ts`) to avoid boilerplate duplication.
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
- Refactored complex UI into hooks and components to improve testability.
- Added unit tests for core hooks, Logs UI, ScriptRunner, EnvEditor, ClientHome, and routeWrapper.
- Reduced Next.js "business logic" (validation rules) in API routes in favor of orchestrator ownership.
- **Lazy-mount tab panels**: tabs are code-split via `React.lazy` and mounted only on first visit ("mount once, keep alive"), eliminating background API calls, SSE connections, and timers from inactive tabs.
- **Consolidated pre-hydration scripts**: three separate `beforeInteractive` scripts (theme, color-scheme, tab restore) merged into a single `PreHydrationScript` to reduce blocking script evaluations.
- **Generic runtime-config hook factory** (`app/hooks/useRuntimeConfig.ts`): all four config-fetching hooks now use a shared `createRuntimeConfigHook<T>()` factory, removing ~120 lines of duplicated fetch/parse/error/loading boilerplate (DRY / Open-Closed Principle).
- **Extracted `ServiceHealth` sub-components**: `ActionRow`, `DataRow`, and `ServiceGroup` moved into `app/components/service-health/` as standalone `React.memo`-wrapped components, reducing `ServiceHealth.tsx` by ~300 lines and eliminating per-render re-creation of inline component definitions.
- **Memoized presentational components**: `ScriptCard`, `ScriptSection`, `ResourceCard`, and `Section` wrapped with `React.memo`; callback functions in `ScriptRunner` stabilized with `useCallback`.
- **Benchmark targets management**: chip-based multiselect UI (`BenchmarkTargets.tsx`) with quick-filter buttons organized into four labeled rows — **Language** (All, None, Java, Go, Python), **Framework** (Spring, Quarkus, Micronaut, Helidon, Spark, Javalin, Dropwizard, Vert.x, Pekko, Django), **Runtime** (JVM, Native, CPython), **Endpoint** (Platform, Virtual, Reactive) — for selecting which service endpoints to include in benchmark runs. Java framework groups display JVM / Native subgroup headings when applicable. Filter and chip colors use exact badge hex values from the main README. Changes persist to `config/benchmark-targets.txt` via the orchestrator API.

## Features

- **Environment Configuration Editor**: Edit the `compose/.env` file through an intuitive UI
- **Benchmark Targets Manager**: Chip-based multiselect UI for choosing which service endpoints to include in benchmark runs, with quick-filter rows (Language, Framework, Runtime, Endpoint) and JVM/Native subgroup layouts
- **Script Runner**: Execute run presets via the orchestrator
- **Application Logs**: Client console and buffered Next.js server logs for local/dev troubleshooting
- **Professional UI**: Built with Material-UI for a polished interface
- **Docker Support**: Runs in its own containerized environment

## Technology Stack

- **Next.js**: v16.2.4
- **React**: v19.2.5
- **Material-UI (MUI)**: v9.0.0
- **TypeScript**: v6.0.2
- **Node.js**: v25.9.0

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
- Benchmark targets proxy: `GET/POST /api/benchmark-targets`
- Orchestrator proxy: `POST /api/orchestrator/submit`, `GET /api/orchestrator/status`, `GET /api/orchestrator/events`

Orchestrator (Quarkus) endpoints used by the router:

- Commands: `GET /v1/commands`
- Run a command: `POST /v1/run` (requires Authorization)
- Job status: `GET /v1/jobs/{id}`
- Job events (SSE): `GET /v1/jobs/{id}/events`
- Env file: `GET/POST /v1/env` (POST requires Authorization)
- Benchmark targets: `GET/POST /v1/benchmark-targets` (POST requires Authorization)
- Aggregated service health: `GET /v1/health`

## Runtime configuration (env-driven)

Some UI behaviors are configured at runtime via Next.js API routes (so changing docker-compose env vars and recreating the container is enough; no rebuild needed).

### Script Runner

Runtime config endpoint: `GET /api/script-runner/config`

Environment variables (passed into the `nextjs-dash` container):
- `SCRIPT_RUNNER_EVENT_STREAM_TIMEOUT_MS` (default: `1800000` = 30 minutes)
- `SCRIPT_RUNNER_EXEC_LOG_MAX_LINES` (default: `500`)

### Logging

Runtime log verbosity is configurable independently for browser/client logs and server/container logs:

- `NEXTJS_DASH_CLIENT_LOG_LEVEL` (default: `info`) 
  - one of: `debug | info | warn | error | silent`
  - controls what the client logger emits (still goes through `console.*` so it is captured in the Logs page)

- `NEXTJS_DASH_SERVER_LOG_LEVEL` (default: `info`)
  - one of: `debug | info | warn | error | silent`
  - controls what the server logger records/emits (server log buffer + stdout/stderr)

### Application Logs

Runtime config endpoint: `GET /api/app-logs/config`

Environment variables:
- `APP_LOGS_CLIENT_MAX_ENTRIES` (default: `400`)
- `APP_LOGS_SERVER_MAX_ENTRIES` (default: `500`)

Types/defaults are centralized in `lib/runtimeConfigTypes.ts` to avoid drift between API routes and client hooks. The client-side hooks themselves are all created via a generic factory in `app/hooks/useRuntimeConfig.ts`.

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

### Docker build pipeline

The Dockerfile uses a four-stage multi-stage build optimized for 16-core build machines:

| Stage       | Purpose                                     | Cache strategy                                                                 |
|-------------|---------------------------------------------|--------------------------------------------------------------------------------|
| **deps**    | `npm ci` (prod + dev)                       | npm tarball cache mount (`/root/.npm`)                                         |
| **quality** | ESLint → tsc → vitest (node) → vitest (dom) | Runs on every build; `--maxWorkers=12`                                         |
| **builder** | `next build` (standalone output)            | `.next/cache` mount; `typescript.ignoreBuildErrors` avoids redundant typecheck |
| **runner**  | Minimal Alpine image with standalone output | Layer cache (static assets rarely change)                                      |

Key design decisions:

- **Quality gates the build**: `builder` depends on `quality` via a sentinel file (`COPY --from=quality /tmp/.quality-ok`). BuildKit won't start the build stage until lint/typecheck/tests pass.
- **Test files excluded by convention**: all tests live under `__tests__/`, which is never `COPY`'d into the builder stage, so they don't bloat the standalone output.
- **Config-before-source COPY split**: `package.json` + `next.config.ts` + `tsconfig.json` are copied before `app/` + `lib/` for better layer cache hit rate.
- **Skip quality for fast iteration**: temporarily comment out the `COPY --from=quality /tmp/.quality-ok /tmp/.quality-ok` line in the Dockerfile, then run `docker buildx build --target builder .` to build without lint/typecheck/tests during development.

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

macOS/Linux (bash):

```bash
docker run -p 3001:3001 \
  -v $(pwd)/../compose/.env:/app/compose/.env \
  -v $(pwd)/../.run:/app/.run \
  nextjs-dash:latest
```

Windows (PowerShell):

```powershell
docker run -p 3001:3001 `
  -v "${PWD}\..\compose\.env:/app/compose/.env" `
  -v "${PWD}\..\.run:/app/.run" `
  nextjs-dash:latest
```

## Testing

Tests are split into two Vitest configurations to avoid running JSDOM for
pure-Node tests:

| Config                  | Environment | Scope                                                                             |
|-------------------------|-------------|-----------------------------------------------------------------------------------|
| `vitest.config.node.ts` | `node`      | `__tests__/lib/**`, `__tests__/app/api/**`                                        |
| `vitest.config.dom.ts`  | `jsdom`     | `__tests__/app/components/**`, `__tests__/app/hooks/**`, `__tests__/app/*.test.*` |

Both configs extend `vitest.config.shared.ts` for common resolve aliases,
pool settings, and coverage excludes.

### Shared test helpers (`__tests__/_helpers/`)

| Helper                         | Purpose                                                                                                                    |
|--------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `mocks.ts`                     | Reusable `vi.mock()` factory objects (`CLIENT_LOGGER_MOCK`, `SERVER_LOGGER_MOCK`, `INWARD_PULSE_MOCK`, `TIMED_PULSE_MOCK`) |
| `consoleSpy.ts`                | `silenceConsole()` — spies on all four `console.*` methods with no-op implementations                                      |
| `storage.ts`                   | `createMockStorage()` — in-memory `Storage` stub for `localStorage` / `sessionStorage`                                     |
| `useJobRunner.test-helpers.ts` | `MockEventSource`, `MockBroadcastChannel`, `installMockGlobals` / `restoreMockGlobals`                                     |

### Available scripts

```bash
npm test              # run all tests (node + dom)
npm run test:node     # node tests only
npm run test:dom      # DOM tests only
npm run test:fast     # all tests with --bail=1 (fail fast)
npm run test:watch    # watch mode (DOM config)
npm run test:coverage # all tests with coverage
```

### Orchestrator restart simulation (unit/integration-ish)

We have a focused hook test that simulates: an SSE stream error followed by the events-meta endpoint returning **404**, which mimics an orchestrator restart (or any state loss).

- Test file: `__tests__/app/hooks/useJobRunner.orchRestart.test.ts`
- What it asserts:
  - the hook terminates the job as `FAILED`
  - it stops reconnect attempts
  - it logs a human-readable message (including the HTTP status)

Run it via the normal test suite.

### SSE smoke scripts

These are lightweight scripts to validate the SSE pipeline end-to-end.

- `scripts/sse-smoke.mjs` (through nextjs-dash proxy)
  - Submits via `/api/orchestrator/submit`
  - Streams via `/api/orchestrator/events`

- `../orchestrator/scripts/direct-sse-smoke.mjs` (direct to orchestrator)
  - Submits via `/v1/run`
  - Streams via `/v1/jobs/:id/events`

Both default to `docker compose version` as the command and can be controlled via env vars.

Example (PowerShell):

```powershell
$env:NEXTJS_DASH_BASE_URL='http://localhost:3001'
node scripts/sse-smoke.mjs

$env:ORCH_BASE_URL='http://localhost:3002'
$env:ORCH_API_KEY='change-me'
node ..\orchestrator\scripts\direct-sse-smoke.mjs
```

# Future roadmap (overview)

### When mobile comes into play

- Orchestrator exposes all required endpoints directly (OpenAPI-first).
- Build a dedicated TypeScript client (and later mobile-native clients) that talks to the orchestrator.
- Harden real-time channels (SSE reconnect support, Last-Event-ID, heartbeats).

### When auth and roles come into play

- Integrate Keycloak in orchestrator.
- Enforce RBAC at orchestrator endpoints.
- Add audit events: who ran what, who changed env, who canceled jobs.

## License

Apache License 2.0 (same as parent project)