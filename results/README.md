# Results

This directory contains benchmark artifacts (raw outputs, summaries, and supporting metadata).

The goal is that every published number in `README.md` or the documentation site can be traced back to a concrete run folder.

## Recommended run folder layout

Create a new folder per benchmark run (timestamped):

- `results/benchmarks/YYYYMMDD_HHMMSS/`
  - `summary.md` (human-readable results and key notes)
  - `metadata.json` (machine-readable environment data)
  - `wrk2/` (raw wrk2 outputs, one file per target)
  - `docker-stats/` (optional: snapshots/logs from `docker stats --no-stream`)
  - `grafana/` (optional: exported dashboards / snapshot links)
  - `screenshots/` (PNG screenshots from Grafana dashboards / Explore)

> Tip: keep filenames explicit. Example: `wrk2/quarkus-jvm-reactive.txt`.

## Minimum metadata to capture

We recommend capturing at least:

- Date/time
- Git commit SHA
- Host CPU model + core/thread count
- Host RAM
- OS + virtualization layer (e.g., Windows 11 + WSL2)
- Docker Desktop / Engine version and Compose version
- Container resource limits used during the run (CPU/memory)
- Benchmark parameters (`WRK_THREADS`, `WRK_CONNECTIONS`, `WRK_DURATION`, `WRK_RATE`)
- Any relevant warnings (thermal throttling, background load, etc.)

## Screenshots

Keep screenshots under `docs/images/screenshots/` for long-term documentation usage.

If you also store run-specific screenshots here, prefer linking from `summary.md` to the canonical images in `docs/images/screenshots/`.

See `docs/images/README.md` for naming and inclusion conventions.

## How headline numbers are derived

- `README.md` and `docs/benchmarking.md` show curated summary tables (RPS rounded to the closest thousand).
- The raw wrk2 outputs for those numbers should live under a corresponding run folder here.

If you publish new results:

1. Add a new run folder under `results/benchmarks/…`.
2. Update the curated summary tables in `README.md` and the docs site (date-stamp the run).
3. Link to the run folder from the summary section.
