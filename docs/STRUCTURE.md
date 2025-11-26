# Project structure — annotated

Below is the canonical repository layout and a short note for each top-level folder. Keep this file up-to-date when you add services or change where artifacts are stored.

.
├── .github/
│   ├── workflows/                # CI for building images, running smoke benchmarks and publishing artifacts
│   └── ISSUE_TEMPLATE.md         # issue templates
├── charts/                       # (future) Helm charts for k8s deployment
├── configs/
│   ├── otel/                     # OpenTelemetry Collector configs
│   ├── grafana/                  # Grafana provisioning & datasource files
│   ├── loki/                     # Loki / promtail config examples
│   └── pyroscope/                # Pyroscope config snippets
├── compose/                      # Docker Compose entrypoints / overrides
│   ├── docker-compose.yml        # main compose for local LGTM + services
│   ├── docker-compose.override.yml
│   └── docker-compose.ci.yml     # deterministic compose for CI
├── docker/                       # helper Dockerfiles / base images
│   └── base-java.Dockerfile
├── services/                     # implementations (framework/runtime/thread-mode)
│   ├── spring/
│   │   ├── jvm/
│   │   │   ├── platform/
│   │   │   ├── virtual/
│   │   │   └── reactive/
│   ├── quarkus/
│   │   ├── jvm/
│   │   └── native/
│   └── (future) go/
├── loadgen/
│   ├── wrk2/                     # wrappers / small binaries for deterministic load generation
│   └── scripts/                   # helper scripts (benchmark wrappers / collectors)
├── dashboards/
│   ├── grafana/                  # Grafana JSON dashboard exports (versioned)
│   └── README.md                 # dashboard usage and import instructions
├── pyroscope/                    # pyroscope server/agent helpers or docs
├── alloy/                        # Alloy collector configs (if maintained separately)
├── results/                      # raw benchmark outputs, CSVs, traces, and metadata
├── docs/                         # additional docs: HOWTO, troubleshooting, architecture diagrams
│   ├── STRUCTURE.md              # this file — canonical repo layout
│   └── HOWTO-BENCHMARK.md
├── scripts/
│   ├── build-images.sh
│   └── reproduce-results.sh
├── .env.example                   # global env defaults for local runs
├── README.md
└── LICENSE

Notes and conventions
- Services naming
  - directories: services/<framework>/<distribution>/<thread-mode>
    - e.g. services/quarkus/jvm/reactive
  - compose service name: <framework>-<distribution>-<mode>
    - e.g. quarkus-jvm-reactive
  - image tag convention: <dockerorg>/observability-benchmarking:<framework>-<distribution>-<mode>-YYYYMMDD

- Reproducibility metadata
  - Always include a small metadata file with each results run in results/<YYYY-MM-DD>:
    - host specs, container limits, image tags/commit SHAs, JVM_OPTS, wrk2 command
  - Example: results/2025-11-01/metadata.json

- Dashboards & provisioning
  - Store Grafana json exports in dashboards/grafana
  - Prefer provisioning for automated imports (configs/grafana/)

- Automation: generating/updating this file
  - You can generate the tree programmatically (example CLI):
    - Linux/macOS: tree -a --dirsfirst -I "node_modules|target|build" -L 3 > docs/STRUCTURE.md
    - Or a small script that expands annotations and inserts the header notes.
  - Consider a CI job that validates that new top-level folders are listed or that checks for a matching README in service sub-folders.

- Ownership & CONTRIBUTING
  - Consider adding CODEOWNERS so PRs to service code notify the right reviewers.
  - Add a CONTRIBUTING.md with expectations for adding services (Dockerfile, .env.example, README, tests, and benchmark script).

If you want, I can:
- Add this docs/STRUCTURE.md to the repo in a follow-up PR, and add a short link in README.md.
- Provide a small script (Bash/Python) that generates the tree automatically in docs/STRUCTURE.md so it never drifts.
