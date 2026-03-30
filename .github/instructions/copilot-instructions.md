# Copilot Custom Instructions — Observability Benchmarking

> These instructions teach GitHub Copilot how this repository is structured, what conventions it follows, and what to watch for during code reviews and code generation.

---

## 1 · Project Identity

This is a **Docker Compose-based observability benchmarking environment** that compares REST service implementations across multiple JVM frameworks (Spring Boot, Quarkus, Micronaut, Helidon, Spark, Javalin, Dropwizard, Vert.x, Pekko), Go (Fiber), and Python (Django) 
All wired into the **Grafana LGTM stack** (Loki, Grafana, Tempo, Mimir) plus Pyroscope and Alloy.

The goal is **apples-to-apples performance comparison**: identical endpoint logic, identical telemetry pipelines, deterministic load generation via wrk2, and fair resource constraints.

---

## 2 · Repository Layout (know where things live)

| Path                         | Purpose                                                                           |
|------------------------------|-----------------------------------------------------------------------------------|
| `compose/`                   | Docker Compose project — profiles: `OBS`, `SERVICES`, `RAIN_FIRE`, `CONTROL`      |
| `config/`                    | Runtime configs for Alloy, Grafana, Loki, Tempo, Mimir, Pyroscope                 |
| `services/java/<framework>/` | Java benchmark targets (each has `jvm/` and optionally `native/`)                 |
| `services/go/`               | Go benchmark targets (`simple/` and `enhanced/`)                                  |
| `services/python/django/`    | Django benchmark targets (WSGI and ASGI)                                          |
| `utils/wrk2/`                | wrk2 load generation scripts                                                      |
| `utils/nextjs-dash/`         | Next.js + MUI control-plane dashboard (TypeScript, React 19)                      |
| `utils/orchestrator/`        | Java-based orchestrator backend for the dashboard                                 |
| `results/benchmarks/`        | Timestamped benchmark run artifacts                                               |
| `integration-tests/`         | Shell-based integration test harness                                              |
| `scripts/`                   | Build utilities — `render-readmes.mjs` generates `README.md` from `*.template.md` |
| `docs/`                      | GitHub Pages site (Jekyll) — architecture, benchmarking methodology, etc.         |
| `.github/workflows/`         | CI: CodeQL, Qodana, Ruff, Go quality, Next.js quality, Pages deploy               |

### Key files to know

- `compose/docker-compose.yml` — main Compose file; includes `obs.yml` and `utils.yml`.
- `compose/.env` — **must** set `HOST_REPO` to the repo root path on the host.
- `services/java/checkstyle.xml` — shared Checkstyle config for all Java services.
- `qodana.yaml` (root) — JVM Qodana config; `services/python/django/qodana.yaml` for Python.
- `scripts/render-readmes.manifest.json` — lists all `*.template.md` → `*.md` pairs.

---

## 3 · Language & Framework Conventions

### 3.1 Java (JDK 25, Eclipse Temurin / GraalVM 25)

- **Build tool**: Maven (wrapper via `.mvn/`).
- **Style**: Google Java Style Guide with project relaxations — enforced by Checkstyle (`services/java/checkstyle.xml`).
  - Max line length: **120 characters**.
  - Indentation: **4 spaces**, no tabs.
  - No wildcard imports. No unused imports.
  - Constants: `UPPER_SNAKE_CASE`. Classes: `PascalCase`. Methods/variables: `camelCase`.
  - Public classes and public methods **must have Javadoc**.
- **Threading models** to understand: platform threads, virtual threads (Project Loom), and reactive (WebFlux / Mutiny / Vert.x event-loop / Pekko dispatcher). Never conflate "reactive wrapper around blocking code" with true non-blocking.
- **JVM flags**: All services share tuned JAVA_TOOL_OPTIONS (G1GC, container support, OOM handling, NMT, pinned-thread tracing). Don't change JVM ergonomics without understanding the shared anchors in `docker-compose.yml`.
- **OpenTelemetry**: Auto-instrumentation via `-javaagent` (OTel Java agent and Pyroscope extension). `service.name` must be set and stable for every service.
- **Native images**: GraalVM Native Image with framework-recommended settings. Builds are extremely slow — `COMPOSE_PARALLEL_LIMIT=1` is intentional; never suggest parallelizing native builds.

### 3.2 Go (1.26)

- Fiber v3 framework.
- Full OTel instrumentation matching the Java pipeline.
- Lint/quality via dedicated `go_quality.yml` workflow.

### 3.3 Python (3.13, Django 6)

- Gunicorn with `gthread` workers (WSGI/platform) or `UvicornWorker` (ASGI/reactive).
- Linting: **Ruff** (PEP 8, import ordering, formatting). Qodana Python Community for semantic checks.
- Dependencies pinned via `pip-compile`.

### 3.4 TypeScript / Next.js (dashboard)

- Next.js 16, React 19, MUI 7, TypeScript 5.9.
- Tests: Vitest (DOM and Node configs).
- Lint: ESLint (`eslint.config.mjs`).
- Quality: dedicated `nextjs_dash_quality.yml` workflow + Qodana JS.

---

## 4 · Docker & Compose Rules

- Every service container runs as a **non-root user** (UID 1001 for Java, UID 65532 for Django). Never suggest `USER root` in runtime stages.
- All Dockerfiles use **multi-stage builds** (builder → runtime). Keep build tools out of the final image.
- Base images come from trusted registries only (Amazon Corretto, Eclipse Temurin, `python:*-slim-bookworm`). Do not introduce unvetted base images.
- Package manager caches must be cleaned (`dnf clean all`, `rm -rf /var/cache/…`, `apt-get clean`).
- File permissions: JARs → `0640`, directories → `g+rX,o-rwx`.
- Resource constraints are set per-service in Compose (CPU limit, memory limit, ulimit). These are intentional for fair benchmarking — do not remove them.
- Compose profiles gate what runs. Never add services without assigning them to the correct profile.
- `HOST_REPO` must resolve to the repo root. Bind-mounts depend on it.

---

## 5 · Observability Pipeline (non-negotiable contract)

Every benchmark target **must** export equivalent telemetry to be a fair comparison:

| Signal   | Backend   | Transport                               |
|----------|-----------|-----------------------------------------|
| Metrics  | Mimir     | OTel → Alloy → Mimir                    |
| Traces   | Tempo     | OTel → Alloy → Tempo                    |
| Logs     | Loki      | OTel / Docker log driver → Alloy → Loki |
| Profiles | Pyroscope | Java agent / eBPF / scrape              |

- `service.name` (OTel resource attribute) must be set, stable, and unique per variant.
- If a service sends fewer signals than others, its RPS looks better, but the comparison is unfair. Flag this in reviews.
- Alloy config lives in `config/alloy/config.alloy`. Changes here affect every service.

---

## 6 · Benchmarking Integrity

- **wrk2** is the load generator — constant-throughput mode, not open-loop.
- Benchmark parameters (`WRK_THREADS`, `WRK_CONNECTIONS`, `WRK_RATE`, `WRK_DURATION`) are in `compose/.env`.
- All services must expose the **same endpoint** (`GET /hello/platform` or equivalent) with the same response shape and caching behavior.
- Wait ~60 seconds after stack start before benchmarking (warm-up).
- JVM workloads need ≥3 minutes for JIT to stabilize.
- Results go into `results/benchmarks/<timestamp>/` with raw wrk2 output + `summary.md` + environment metadata.
- Never compare a service with OTel instrumentation against one without.

---

## 7 · CI/CD & Quality Gates

### Workflows

| Workflow                    | Scope                                 | What it checks                                                         |
|-----------------------------|---------------------------------------|------------------------------------------------------------------------|
| `qodana_code_quality.yml`   | `services/java`, `utils/orchestrator` | Qodana JVM (IntelliJ inspections), hard gate: 0 critical/high/moderate |
| `django_python_quality.yml` | `services/python/django`              | Ruff lint + format, Django checks, unit tests, Qodana Python           |
| `go_quality.yml`            | `services/go`                         | Go vet, staticcheck, golangci-lint, unit tests                         |
| `nextjs_dash_quality.yml`   | `utils/nextjs-dash`                   | ESLint, TypeScript check, Vitest, Qodana JS                            |
| `codeql.yml`                | All languages                         | CodeQL security scanning (SARIF → Security tab + Pages report)         |
| `pages.yml`                 | `docs/` + quality reports             | Jekyll build → GitHub Pages deploy, hosts Qodana + CodeQL reports      |

### Review-time checklist

- [ ] Checkstyle passes (`mvn checkstyle:check`)
- [ ] Ruff passes (`ruff check` + `ruff format --check`) for Python changes
- [ ] ESLint + `tsc --noEmit` clean for dashboard changes
- [ ] Unit tests pass in the affected module
- [ ] No new Qodana critical/high/moderate findings
- [ ] No new CodeQL alerts
- [ ] Dependabot-managed dependencies are not pinned to outdated versions

### Node 24 migration convention

All workflows set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow-level `env:` (not job/step). Each occurrence is annotated with `# TODO(node24-migration)`. Do not duplicate this at inner scopes. The resulting Actions warnings are expected and informational.

### Action pinning

All GitHub Actions are pinned to **full commit SHAs** (with version comments) for supply-chain hardening. Never pin to a mutable tag alone.

---

## 8 · Documentation Conventions

- **Generated READMEs**: Files listed in `scripts/render-readmes.manifest.json` are rendered from `*.template.md` by `scripts/render-readmes.mjs`. **Never edit the generated `*.md` directly** — edit the `.template.md` source instead.
- Each generated file has a header comment: `<!-- Generated from ... Do not edit ... directly. -->`
- The docs site is Jekyll-based under `docs/` with `docs/Gemfile` for dependencies.
- Screenshots and diagrams go in `docs/images/`.
- `docs/_site/` is generated output — do not commit it.

---

## 9 · Security Postures

- **No secrets in code or config**. Sensitive values come from env vars.
- `.env` files with secrets must never be committed.
- Dockerfiles: non-root users, multi-stage builds, minimal attack surface.
- Grafana default creds (`a/a`) are for local dev only — always flag if someone hardcodes real credentials.
- CodeQL runs on every push to `main`, on PRs, and on a weekly schedule.
- Dependabot monitors: GitHub Actions, Bundler (docs), pip (Django WSGI + ASGI), npm (Next.js dashboard), gomod (Go enhanced).

---

## 10 · Adding a New Service (the full checklist)

If a PR adds a new benchmark target, verify all of these:

1. **Implementation** under `services/<lang>/<framework>/` with Dockerfile + source + README.
2. **Compose wiring** in `compose/docker-compose.yml` — correct profile (`SERVICES`), resource constraints matching other services, same Docker network.
3. **Telemetry** — OTel metrics, traces, logs all flowing through Alloy. `service.name` set.
4. **Load generator entry** — wrk2 container or target pointing at the new service's endpoint.
5. **Dashboard integration** — Grafana panels queryable by `service_name`.
6. **Documentation updates** — `README.template.md` (not `README.md`), `docs/tools-technologies.template.md`, `docs/benchmarking.template.md`.
7. **Results folder** ready for first benchmark run under `results/benchmarks/`.

---

## 11 · Code Review Red Flags (what to always call out)

### Architecture & fairness
- Service with fewer OTel signals than siblings → unfair RPS comparison.
- Different endpoint logic or response shapes across services.
- Missing or inconsistent `service.name`.
- Resource constraints (CPU/memory) are removed or asymmetric between services.

### Java-specific
- Wildcard imports, unused imports, missing Javadoc on public API.
- Line length > 120 characters.
- Tabs instead of spaces.
- Blocking calls inside reactive pipelines (e.g., `Thread.sleep` in a WebFlux chain).
- Virtual-thread pinning without `Djdk.tracePinnedThreads=full`.
- Changes to shared JVM flags without cross-service impact analysis.

### Docker-specific
- `USER root` in runtime stage.
- Missing cache cleanup after package installation.
- Build tools or source code leaking into runtime image.
- Secrets baked into image layers.
- Services without health checks.

### CI/CD-specific
- Actions pinned to mutable tags instead of commit SHAs.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` duplicated at job/step level.
- Qodana quality gate relaxed without a reviewed baseline SARIF.
- New workflow missing the Node 24 migration env var.

### Documentation
- Direct edits to a file that has a `.template.md` source.
- Benchmark results updated in `README.md` without updating the template.
- Missing `docs/images/` assets referenced in docs.

### Security
- Hardcoded credentials, tokens, or API keys anywhere.
- New base images from untrusted registries.
- Containers running as root.
- `.env` files with secrets added to version control.

---

## 12 · Engineering Principles — What Applies Here (and What Doesn't)

This is a **benchmarking and observability environment**, not a domain-driven enterprise application. Apply well-known engineering principles proportionally — enforce what's relevant, skip what adds ceremony without value.

### Twelve-Factor App (mostly followed — reinforce, don't duplicate)

| Factor                 | Status     | How it manifests                                                                                                        |
|------------------------|------------|-------------------------------------------------------------------------------------------------------------------------|
| I. Codebase            | ✅ Followed | Single repo, one Compose project, many services                                                                         |
| II. Dependencies       | ✅ Followed | Maven BOMs, `pip-compile`, `package-lock.json` — all pinned explicitly                                                  |
| III. Config            | ✅ Followed | `compose/.env` + env var injection everywhere. Never suggest hardcoding config values that currently come from env vars |
| IV. Backing services   | ✅ Followed | Grafana stack components are attached resources via Compose networking                                                  |
| V. Build, release, run | ✅ Followed | Multi-stage Docker builds separate build from runtime. IntelliJ run configs and Compose profiles separate concerns      |
| VI. Processes          | ✅ Followed | Containers are stateless; benchmark state lives in `results/` on the host                                               |
| VII. Port binding      | ✅ Followed | Each service self-contains its HTTP server and exports a port                                                           |
| VIII. Concurrency      | Partially  | Scaling is not the goal — fair single-instance comparison is. Do not suggest horizontal scaling patterns                |
| IX. Disposability      | ✅ Followed | Containers are ephemeral; `--force-recreate` is a normal workflow                                                       |
| X. Dev/prod parity     | ✅ Followed | Same Docker images locally and in CI                                                                                    |
| XI. Logs               | ✅ Followed | Logs as streams → OTel → Alloy → Loki. Never suggest writing logs to local files inside containers                      |
| XII. Admin processes   | N/A        | No one-off admin tasks — the orchestrator handles operational actions                                                   |

**Key takeaway for Copilot:** If a suggestion would move config out of env vars into hardcoded values, write logs to files instead of stdout/stderr, or add state inside containers — flag it as a Twelve-Factor violation.

### SOLID Principles (apply proportionally)

- **SRP**: Relevant for the orchestrator (`utils/orchestrator/`) and dashboard (`utils/nextjs-dash/`). Less relevant for benchmark services — a single controller class with one endpoint is already minimal; do not suggest splitting it further.
- **OCP / LSP / ISP**: Useful when reviewing the orchestrator's Java code or the dashboard's TypeScript. Not worth enforcing on 30-line benchmark controllers.
- **DIP**: Already practiced — services depend on OTel abstractions, not concrete backends. Reinforce this in reviews but don't over-abstract simple code.

**Key takeaway for Copilot:** Do not suggest architectural patterns (hexagonal, ports-and-adapters, repository layers) for benchmark service implementations. They are intentionally thin. Reserve design-pattern scrutiny for the orchestrator and dashboard.

### Clean Architecture (not a fit for benchmark services)

The benchmark services are **deliberately minimal** — a REST endpoint, an in-memory cache, a health check, and OTel instrumentation. This is by design: the thinner the service, the more the benchmark measures the *framework*, not application logic.

- **Do not** suggest adding use-case classes, domain layers, or repository abstractions to benchmark services.
- **Do** expect reasonable structure in the orchestrator and dashboard (separation of routes from business logic, typed API contracts, etc.).

### OWASP Top Ten (scoped to what's applicable)

This environment is optimized for **local benchmarking**, not internet-facing production. Most OWASP categories don't apply directly, but some hygiene items do:

| OWASP Category                 | Applicable? | What to watch for                                                                                                                                  |
|--------------------------------|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| A01: Broken Access Control     | ⚠️ Limited  | Grafana creds are `a/a` for local dev — fine here, flag if real creds appear                                                                       |
| A02: Cryptographic Failures    | ⚠️ Limited  | No TLS by design (local Docker network). Flag if secrets are logged or stored in plain text                                                        |
| A03: Injection                 | ✅ Yes       | The orchestrator executes shell commands — validate that user input from the dashboard is sanitized before reaching `ProcessBuilder` or equivalent |
| A04: Insecure Design           | ✅ Yes       | Non-root containers, multi-stage builds, minimal images — already enforced in Section 4                                                            |
| A05: Security Misconfiguration | ✅ Yes       | Default ports, debug flags, verbose logging in prod-like images — flag unnecessary exposure                                                        |
| A06: Vulnerable Components     | ✅ Yes       | Dependabot + CodeQL + Qodana already scan. Flag outdated dependencies in reviews                                                                   |
| A07: Auth Failures             | ❌ N/A       | No user authentication system exists                                                                                                               |
| A08: Data Integrity Failures   | ⚠️ Limited  | GitHub Actions pinned to SHAs (supply-chain). Flag unsigned or unverified dependencies                                                             |
| A09: Logging Failures          | ✅ Yes       | The full LGTM stack exists for this. Ensure services don't log sensitive data (Section 9)                                                          |
| A10: SSRF                      | ⚠️ Limited  | The orchestrator proxies requests — ensure it doesn't blindly forward user-supplied URLs to internal services                                      |

**Key takeaway for Copilot:** Focus OWASP vigilance on the **orchestrator** (it runs shell commands and proxies requests) and the **dashboard** (it accepts user input). Benchmark services have negligible attack surface.

---

## 13 · Tone & Style for Suggestions

- Be direct and specific. Cite the file path and line.
- Prefer actionable fixes to vague advice.
- When suggesting a JVM flag change, explain the impact on all services that share the anchor.
- When suggesting a Compose change, state which profile(s) are affected.
- If a change looks correct but breaks benchmarking fairness, flag it as a **fairness concern** even if the code is technically valid.
- Respect the existing threading-model taxonomy: **platform**, **virtual**, **reactive**. Do not invent new categories or mislabel them.