# Project Structure

This document describes the repository layout and the responsibility of each top-level folder.

> Source of truth: if this document drifts, the filesystem layout in the repository is the ground truth.

## Repository tree (high level)

```text
Observability-Benchmarking/
├── .github/                  # GitHub Actions workflows
├── .run/                     # IntelliJ run configurations
├── compose/                  # Docker Compose project (profiles: OBS / SERVICES / RAIN_FIRE)
├── config/                   # Provisioned configs for Grafana + LGTM components
├── data/                     # Local persisted volumes (dev/test only)
├── docs/                     # GitHub Pages site sources (what you’re reading)
├── integration-tests/        # Integration test harness
├── results/                  # Benchmark artifacts and summaries
├── services/                 # Benchmark targets (Go + Java frameworks)
├── utils/                    # Supporting tooling (wrk2, dashboard, orchestrator)
├── LICENSE
├── qodana.yaml
└── README.md
```

## Folder responsibilities

### `.github/`

GitHub automation:

- Workflows for GitHub Pages deployment and static analysis.

### `.run/`

IntelliJ IDEA run configurations used to build, start, and benchmark the stack.

### `compose/`

The Docker Compose project directory. This is where the “environment” lives (observability stack, services, and load generators).

Key notes:

- Compose profiles control what starts:
  - **OBS**: Grafana + Loki + Tempo + Mimir + Pyroscope + Alloy
  - **SERVICES**: Spring/Quarkus/Go service containers
  - **RAIN_FIRE**: wrk2 load generator containers
- `compose/.env` contains environment configuration (including required `HOST_REPO`).

### `config/`

Provisioned configuration used by the stack at runtime:

- `config/grafana/` — Grafana provisioning, datasources, dashboards
- `config/alloy/` — Alloy (OpenTelemetry collector) pipeline configuration
- `config/loki/`, `config/tempo/`, `config/mimir/`, `config/pyroscope/` — LGTM component configs

### `data/`

Local persisted volumes for the observability stack.

- This is intended for local runs only.
- Do not treat the content as a stable API.

### `docs/`

Documentation site source (GitHub Pages).

- `docs/index.html` — landing page
- `docs/getting-started.md` — setup guide (published at `/docs/getting-started`, with `/getting-started.html` as a stable entry link)
- `docs/benchmarking.md` — benchmarking methodology (published at `/docs/benchmarking`, with `/benchmarking.html` as a stable entry link)
- `docs/tools-technologies.md` — toolchain and technology overview (published at `/docs/tools-technologies`, with `/tools-technologies.html` as a stable entry link)
- `docs/adding-a-service.md` — how to add a new benchmark target (published at `/docs/adding-a-service`, with `/adding-a-service.html` as a stable entry link)
- `docs/images/` — screenshots and diagrams used in docs
- `docs/_site/` — generated static site output (do not commit)

### `integration-tests/`

Integration test harness and logs.

### `results/`

Benchmark outputs and run summaries.

- `results/benchmarks/…` contains timestamped runs.
- See `results/README.md` for the recommended per-run folder structure and metadata.

### `services/`

Benchmark targets / service implementations.

- `services/java/` contains JVM frameworks (Spring, Quarkus, Helidon, Micronaut, … depending on what’s implemented).
- `services/go/` contains Go implementations.

Each service folder typically includes a Docker build context and the application sources.

### `utils/`

Supporting utilities used by the environment:

- `utils/wrk2/` — wrk2 container + scripts for load generation
- `utils/nextjs-dash/` — dashboard UI (control plane)
- `utils/orchestrator/` — orchestration helper service

## “Do not edit” note (for documentation-only changes)

During documentation polish passes, be careful not to change runtime behavior.

As a rule of thumb, avoid editing these directories unless you explicitly intend to modify the running system:

- `compose/`
- `services/`
- `utils/`
- `integration-tests/`

For documentation changes, prefer editing:

- `README.md`
- `docs/`
- `results/README.md`
