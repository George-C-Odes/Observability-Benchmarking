# Images and Visual Assets

This directory contains **real** screenshots, exports, and other visual assets used by the documentation site.

## Folder layout

- `docs/images/screenshots/` — curated screenshots used on the live docs pages
  - `grafana/` — dashboards (metrics, logs, traces, profiles)
  - `nextjs-dash/` — Next.js dashboard (control plane UI)
  - `exports/` — exported artifacts (e.g., benchmark output location)

See also: `docs/images/screenshots/README.md` for the current screenshot inventory.

## Current screenshots (January 19, 2026)

### Grafana

- Metrics: `screenshots/grafana/metrics_by_service_name.png`, `screenshots/grafana/metrics_by_endpoint.png`
- Logs: `screenshots/grafana/logs.png`
- Traces: `screenshots/grafana/traces.png`
- Profiles: `screenshots/grafana/profiles_jvm.png`, `screenshots/grafana/profiles_native.png`, `screenshots/grafana/profiles_go.png`

### Control plane (Next.js dashboard)

- Dashboard hub: `screenshots/nextjs-dash/project_hub.png`
- Env config view: `screenshots/nextjs-dash/environment_config.png`
- Script runner: `screenshots/nextjs-dash/script_runner_1.png`, `screenshots/nextjs-dash/script_runner_2.png`
- Service health: `screenshots/nextjs-dash/service_health_1.png`, `screenshots/nextjs-dash/service_health_2.png`

### Benchmark exports

- Output location example: `screenshots/exports/benchmark-file-location.png`

## How to include screenshots in docs (recommended)

Because the site is served under a repository base URL (`/Observability-Benchmarking`), always use `relative_url`:

```markdown
![Grafana: metrics by service]({{ '/images/screenshots/grafana/metrics_by_service_name.png' | relative_url }})
```

## Style guidelines

- Prefer PNG for screenshots.
- Crop to the relevant area (avoid huge empty margins).
- Keep the UI readable (avoid downscaling too far).
- Use descriptive names.
- Add meaningful alt text and a short caption in surrounding text.
