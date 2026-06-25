# Agent Implementation Guide

Purpose: help coding agents build context quickly, make precise edits, and avoid loading the entire repository for routine tasks.

## Start here

1. Identify the touched path, then open only the matching section below.
2. Prefer existing module patterns over new abstractions.
3. For generated Markdown, edit the `*.template.md` source and run the renderer.
4. Preserve benchmark fairness: same endpoint behavior, telemetry shape, resource limits, and service naming across comparable targets.
5. Run the cheapest relevant validation for the changed area before broad checks.

For deeper routing, commands, and rationale, open `docs/AGENT_IMPLEMENTATION_MAP.md`.

## Path router

| If the task touches | Read first | Then inspect |
| --- | --- | --- |
| Root docs or generated READMEs | `scripts/render-readmes.manifest.json`, the relevant `*.template.md` | Generated target only to verify output |
| Docker Compose or benchmark wiring | `compose/docker-compose.yml`, `compose/obs.yml`, `compose/utils.yml`, `compose/.env` | A sibling service with the same profile |
| Java benchmark services | Matching `services/java/<framework>/.../README.md`, `pom.xml` | Same framework tests plus `services/java/checkstyle.xml` |
| Java orchestrator | `utils/orchestrator/README.md`, `utils/orchestrator/pom.xml` | `application/`, `resource/`, `domain/`, and matching tests |
| Go services | `services/go/<simple|enhanced>/README.md`, `go.mod`, `Makefile` | `internal/*` for enhanced, `cmd/server` for simple |
| Django services | `services/python/django/README.md` | `gunicorn/common`, then `WSGI` or `ASGI` runtime wrapper |
| Next.js dashboard | `utils/nextjs-dash/README.md`, `package.json` | `app/components`, `app/api`, `lib`, matching `__tests__` |
| CI and quality reports | Matching `.github/workflows/*.yml` | `scripts/pages/*` if report output changes |
| Docs site | `docs/README.md`, `docs/STRUCTURE.md` | Specific page plus `docs/_layouts/default.html` if layout changes |

## Non-negotiable contracts

- Do not edit generated files directly when a template exists. Use `scripts/render-readmes.mjs` after template changes.
- Keep GitHub Actions pinned to full commit SHAs with version comments.
- Keep workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` scoped at top-level `env:` only.
- Runtime containers stay non-root and multi-stage; do not add build tools to final images.
- Compose profile, CPU, memory, ulimit, health, and telemetry settings are part of benchmark fairness.
- `service.name` and endpoint response semantics must remain stable across benchmark variants.
- The orchestrator executes commands; treat command validation, path validation, and auth filters as security-sensitive.

## Cheapest validation by area

| Area | Focused checks |
| --- | --- |
| `utils/nextjs-dash/**` | `npm run lint`, `npm run typecheck`, `npm run test:fast` from `utils/nextjs-dash` |
| `utils/orchestrator/**` | `mvn verify -B` from `utils/orchestrator` |
| `services/java/<module>/**` | `mvn verify -B` from the changed Maven module; add Checkstyle if style-sensitive |
| `services/go/enhanced/**` or `services/go/simple/**` | `go test ./... -race`, `go vet ./...`, `golangci-lint run` from the changed module |
| `services/python/django/gunicorn/common/**` | `python -m compileall src`, `python -m ruff check .`, `python -m ruff format --check .` from `common` |
| Django `WSGI` or `ASGI` runtime | Install common package, then `python manage.py check` and `python manage.py test obbench_django_common.tests --verbosity=2` |
| Template docs | `node scripts/render-readmes.mjs` and inspect the generated diff |

Use broader CI reasoning only after the focused path is clean or when shared contracts are changed.

## High-signal search patterns

- Endpoint parity: `rg "hello/(platform|virtual|reactive)|HelloService|CACHE_SIZE" services utils`
- Telemetry: `rg "otel|OpenTelemetry|service.name|OTEL_|Micrometer|Pyroscope" services compose config utils`
- Generated docs: `rg "Generated from|render-readmes|template.md" README.md docs services integration-tests scripts`
- Command execution/security: `rg "ProcessBuilder|CommandPolicy|WorkspacePathValidator|RequireOrchestratorAuth|BearerAuth" utils/orchestrator`
- CI pinning: `rg "uses: [^@]+@[^0-9a-f]|FORCE_JAVASCRIPT_ACTIONS_TO_NODE24" .github/workflows`

## Editing posture

- Keep benchmark services thin; do not add enterprise layering to single-endpoint implementations.
- Reserve deeper architecture changes for the dashboard and orchestrator, where user input, command execution, and state coordination live.
- Prefer path-specific tests and existing fixtures. Add tests near the changed behavior.
- Document behavioral changes in template docs when user-facing behavior or supported versions change.
