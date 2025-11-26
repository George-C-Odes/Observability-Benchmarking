# Project structure — full tree (no inline comments)

Below is the full repository tree. Descriptions and notes follow after the code block.

```
.
├── .github/
│   ├── workflows/
│   └── ISSUE_TEMPLATE.md
├── charts/
├── configs/
│   ├── otel/
│   ├── grafana/
│   ├── loki/
│   └── pyroscope/
├── compose/
│   ├── docker-compose.yml
│   ├── docker-compose.override.yml
│   └── docker-compose.ci.yml
├── docker/
│   └── base-java.Dockerfile
├── services/
│   ├── spring/
│   │   ├── jvm/
│   │   │   ├── platform/
│   │   │   │   ├── Dockerfile
│   │   │   │   ├── README.md
│   │   │   │   └── src/
│   │   │   ├── virtual/
│   │   │   │   ├── Dockerfile
│   │   │   │   ├── README.md
│   │   │   │   └── src/
│   │   │   └── reactive/
│   │   │       ├── Dockerfile
│   │   │       ├── README.md
│   │   │       └── src/
│   ├── quarkus/
│   │   ├── jvm/
│   │   │   ├── platform/
│   │   │   │   ├── Dockerfile
│   │   │   │   ├── README.md
│   │   │   │   └── src/
│   │   │   ├── virtual/
│   │   │   │   ├── Dockerfile
│   │   │   │   ├── README.md
│   │   │   │   └── src/
│   │   │   └── reactive/
│   │   │       ├── Dockerfile
│   │   │       ├── README.md
│   │   │       └── src/
│   │   └── native/
│   │       ├── platform/
│   │       │   ├── Dockerfile
│   │       │   ├── README.md
│   │       │   └── src/
│   │       ├── virtual/
│   │       │   ├── Dockerfile
│   │       │   ├── README.md
│   │       │   └── src/
│   │       └── reactive/
│   │           ├── Dockerfile
│   │           ├── README.md
│   │           └── src/
│   └── go/
│       └── (future)/
├── loadgen/
│   ├── wrk2/
│   └── scripts/
├── dashboards/
│   ├── grafana/
│   └── README.md
├── pyroscope/
├── alloy/
├── results/
│   └── 2025-11-01/
├── docs/
│   ├── STRUCTURE.md
│   ├── HOWTO-BENCHMARK.md
│   └── TROUBLESHOOTING.md
├── scripts/
│   ├── build-images.sh
│   └── reproduce-results.sh
├── .env.example
├── README.md
└── LICENSE
```

Folder responsibilities and short notes

- .github/
    - workflows: CI pipelines for building images, smoke benchmarks, and other automation.
    - ISSUE_TEMPLATE.md: issue templates for contributors.

- charts/
    - Helm charts for Kubernetes (future).

- configs/
    - otel/: OpenTelemetry Collector configs.
    - grafana/: Grafana provisioning and datasources.
    - loki/: Loki / promtail examples.
    - pyroscope/: Pyroscope config snippets.

- compose/
    - docker-compose.yml: local LGTM + service compose.
    - docker-compose.override.yml: developer overrides.
    - docker-compose.ci.yml: deterministic compose used in CI.

- docker/
    - Base image Dockerfiles (pin versions and reproducible builds).

- services/
    - Organized as services/<framework>/<distribution>/<thread-mode>.
    - Each leaf folder should contain Dockerfile, README.md, and src/.
    - Examples included for Spring and Quarkus (JVM + native variants); Go reserved for future.

- loadgen/
    - wrk2 wrappers and scripts used to run deterministic benchmarks.

- dashboards/
    - Grafana JSON exports and instructions for importing/provisioning.

- pyroscope/
    - Helpers, docs and config for profiling.

- alloy/
    - Alloy/OpenTelemetry collector configs if maintained separately.

- results/
    - Store raw outputs, CSVs, traces, and a metadata file per run (e.g., results/YYYY-MM-DD/metadata.json).

- docs/
    - Canonical docs including this STRUCTURE.md, HOWTOs and troubleshooting.

- scripts/
    - Helper scripts to build images and reproduce results.

- .env.example
    - Global env defaults for local runs.

- README.md / LICENSE
    - Top-level project overview and license.
