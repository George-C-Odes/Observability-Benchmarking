# Agent Implementation Map

This document is for coding agents that need more context than `AGENTS.md` provides. Open only the sections relevant to the current task. The goal is lower token use through routing, not a second README.

## Repository model

This repository is a local Docker Compose benchmarking lab for comparing REST implementations under equivalent observability load. The important implementation surfaces are:

| Surface | Role | Main paths |
| --- | --- | --- |
| Benchmark services | Thin comparable REST targets across JVM, Go, and Django | `services/java`, `services/go`, `services/python/django` |
| Control plane | Browser UI plus backend command/orchestration API | `utils/nextjs-dash`, `utils/orchestrator` |
| Load and observability | wrk2 plus Grafana LGTM, Pyroscope, Alloy | `utils/wrk2`, `compose`, `config` |
| Docs and reports | Generated README set, Jekyll site, quality reports | `README.template.md`, `docs`, `scripts`, `.github/workflows` |

The highest-cost mistake for an agent is loading many framework modules when the task only touches one implementation. Use sibling modules as patterns, but inspect only the closest sibling needed.

## Context budget strategy

| Phase | Budget target | What to load |
| --- | --- | --- |
| Triage | 1-3 files | `AGENTS.md`, task file, nearest README or manifest |
| Local pattern match | 3-8 files | Changed file, matching test, one sibling implementation, build config |
| Contract check | 2-5 files | Compose/env/workflow/template files that define cross-module behavior |
| Broad reasoning | On demand | `docs/TESTING.template.md`, `.github/instructions/copilot-instructions.md`, workflow matrix |

Avoid opening every service module unless the change explicitly modifies benchmark parity across all frameworks.

## Task routing recipes

### Add or change a benchmark endpoint

Read:

- Target service source file and its matching tests.
- One sibling with the same thread model: platform, virtual, or reactive.
- `compose/docker-compose.yml` if container wiring changes.
- `config/alloy/config.alloy` only if telemetry export changes.

Check:

- Response shape and route naming stay comparable.
- Cache behavior, sleep/log query semantics, and telemetry counters remain equivalent.
- `service.name` remains stable and unique.

Do not add application layers just to satisfy generic architecture advice. These services are intentionally thin so benchmark work measures framework/runtime behavior.

### Add a new benchmark service

Read:

- `docs/ADDING_A_SERVICE.md` or `docs/adding-a-service.md`.
- Closest language/framework sibling.
- `compose/docker-compose.yml`, `compose/.env`, and `config/benchmark-targets.txt`.
- `README.template.md`, `docs/tools-technologies.template.md`, and `docs/benchmarking.template.md`.

Expected updates:

- Service source, Dockerfile, README, tests.
- Compose `SERVICES` profile entry with matching resources and network behavior.
- Telemetry export matching sibling services.
- wrk2/dashboard/benchmark target wiring if the service should be selectable.
- Template docs, then generated docs via `scripts/render-readmes.mjs`.

### Work on the orchestrator

Read:

- `utils/orchestrator/README.md`.
- `utils/orchestrator/src/main/java/.../application` for business rules.
- `utils/orchestrator/src/main/java/.../resource` for API boundaries.
- `utils/orchestrator/src/main/java/.../domain` for parsing/tokenizing utilities.
- Matching tests under `utils/orchestrator/src/test/java`.

Security-sensitive areas:

- `CommandPolicy`, `CommandGroupValidator`, and validators.
- `WorkspacePathValidator` and environment file handling.
- `ProcessCommandRunner` and job admission/streaming code.
- Auth/request filters under `security`.

Validation:

```bash
cd utils/orchestrator
mvn verify -B
```

### Work on the Next.js dashboard

Read:

- `utils/nextjs-dash/package.json`.
- The specific component, hook, API route, or lib file.
- Matching test in `utils/nextjs-dash/__tests__`.
- `utils/nextjs-dash/lib/orchestratorClient.ts` when orchestration API calls change.

Conventions:

- API routes use shared response/error helpers from `lib` where available.
- Components and hooks already have focused tests; extend the nearest test rather than creating a broad integration test first.
- Keep control-plane UI work operational and scan-friendly; this is a tool surface, not a marketing page.

Validation:

```bash
cd utils/nextjs-dash
npm run lint
npm run typecheck
npm run test:fast
```

Use `npm run test` or `npm run build` when shared rendering, routing, or runtime config changes.

### Work on Go services

Read:

- `services/go/<simple|enhanced>/README.md`.
- `go.mod`, `Makefile`, and the changed package.
- For enhanced service changes, inspect the relevant `internal/*` package and its test.

Validation:

```bash
cd services/go/enhanced # or services/go/simple
go test ./... -race -count=1
go vet ./...
golangci-lint run
```

Run `go mod tidy` only when dependencies or imports change, then inspect `go.mod` and `go.sum`.

### Work on Django services

Read:

- `services/python/django/README.md`.
- `services/python/django/gunicorn/common/src/obbench_django_common` for shared behavior.
- The runtime wrapper under `WSGI` or `ASGI` only when entrypoint, Gunicorn, or settings behavior changes.

Validation examples:

```bash
cd services/python/django/gunicorn/common
python -m compileall src
python -m ruff check .
python -m ruff format --check .
```

For WSGI or ASGI runtime checks, install the common package plus that module's requirements, then run:

```bash
python manage.py check
python manage.py test obbench_django_common.tests --verbosity=2
```

On Windows, `pyroscope-io` may need filtering for local installs; CI runs the full Linux dependency set.

### Work on docs

Generated files are listed in `scripts/render-readmes.manifest.json`. Edit templates first:

- `README.template.md` -> `README.md`
- `docs/*.template.md` -> generated docs page
- `integration-tests/README.template.md` -> integration test README
- `services/README.template.md` -> service overview
- selected service README templates under Quarkus and Spring

Validation:

```bash
node scripts/render-readmes.mjs
node scripts/render-readmes.test.mjs
```

For Jekyll page-only docs, inspect `docs/_config.yml`, `docs/_layouts/default.html`, and the changed page. Do not commit `docs/_site`.

### Work on CI or quality reports

Read:

- The exact workflow under `.github/workflows`.
- Shared report helpers in `scripts/pages/report-helpers.mjs` when HTML report output changes.
- Specific generator scripts only for the relevant language report.

Contracts:

- Actions are pinned to full commit SHAs with version comments.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` appears at workflow-level `env:` with the existing TODO comment.
- Report upload artifact names are consumed by Pages/report assembly; rename with care.

## Cross-cutting invariants

| Invariant | Why agents should care |
| --- | --- |
| Endpoint parity | Benchmark results are only meaningful when services do equivalent work. |
| Telemetry parity | Missing metrics, logs, traces, or profiles can make a service look faster unfairly. |
| Resource parity | CPU, memory, ulimit, and Compose profile changes alter benchmark conditions. |
| Generated docs discipline | Direct generated-file edits create drift and waste reviewer time. |
| Pinned supply chain | Mutable GitHub Action tags weaken the repository's security posture. |
| Thin benchmark services | Extra abstractions change code paths and distort framework comparisons. |
| Orchestrator input validation | It bridges UI actions to local commands and file operations. |

## File selection heuristics

Use these before broad search:

| Need | Start with |
| --- | --- |
| Runtime version | `compose/.env`, root `README.template.md`, module `pom.xml`/`package.json`/`go.mod`/requirements |
| Service naming | `compose/docker-compose.yml`, module config, OTel resource attributes |
| Dashboard API behavior | `utils/nextjs-dash/app/api/**/route.ts`, then `lib/*`, then tests |
| Orchestrator API behavior | `utils/orchestrator/.../resource`, then `application`, then `domain` |
| Quality failure | Matching workflow, then module build config, then report script if artifact generation failed |
| Docs drift | `scripts/render-readmes.manifest.json`, template source, generated file header |

## Recommended PR notes for agents

When opening implementation PRs, include:

- Scope: paths and subsystem changed.
- Contract impact: endpoint, telemetry, Compose, generated docs, or CI behavior.
- Validation: exact commands run or why a check was skipped.
- Residual risk: any cross-service parity not fully exercised locally.

## Justification for these agent files

- `AGENTS.md` is placed at the repository root because many coding agents discover it automatically before loading heavier docs.
- The root guide is compact by design: it routes by path, lists non-negotiable contracts, and gives focused validation without duplicating the long Copilot instructions.
- This deeper map lives in `docs/` so agents can open it only after the task is known, which keeps default context small.
- The split supports both precision and low token usage: agents get a cheap first-pass index and a structured second-pass map instead of reading `README.md`, `docs/TESTING.md`, and the full Copilot instructions for every task.
- The content favors implementation routing over project marketing, because coding agents need file selection, invariants, and validation commands more than narrative overview.
