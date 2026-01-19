# Screenshots

This folder contains **real screenshots** used by the live GitHub Pages site.

> Tip: Use short, descriptive kebab-case names. Keep screenshots cropped and readable. Prefer PNG.

## Current screenshots (January 19, 2026)

### Next.js dashboard (control plane UI)
Path: `docs/images/screenshots/nextjs-dash/`

- `project_hub.png`  Main hub / landing within the dashboard
- `environment_config.png`  Edit and validate `compose/.env`-style configuration
- `script_runner_1.png`, `script_runner_2.png`  Run orchestration scripts and follow progress
- `service_health_1.png`, `service_health_2.png`  Service health/status views
- `logs.png`  Control plane logs / streaming output
- `system_info.png`  Environment/system info screen

### Grafana
Path: `docs/images/screenshots/grafana/`

- `metrics_by_service_name.png`  Service-level throughput/latency dashboards
- `metrics_by_endpoint.png`  Endpoint-level metrics breakdown
- `metrics_misc_1.png`, `metrics_misc_2.png`  Additional dashboard panels
- `traces.png`  Tempo traces view
- `logs.png`  Loki logs view
- `profiles_jvm.png`  JVM continuous profiling
- `profiles_native.png`  Native-image profiling
- `profiles_go.png`  Go profiling

### Benchmark outputs
Path: `docs/images/screenshots/exports/`

- `benchmark-file-location.png`  Where benchmark outputs are written on disk

## How screenshots are used in the docs

- The public docs are served under the repository base URL, so links should be **relative to the site root**.
- Recommended Markdown pattern:

```markdown
![Alt text]({{ '/images/screenshots/grafana/metrics_by_service_name.png' | relative_url }})
```

That keeps paths correct locally (with `--baseurl /Observability-Benchmarking`) and on GitHub Pages.
