# Images and Visual Assets

This directory contains screenshots, diagrams, and other visual assets for the documentation.

## Recommended Assets

### Grafana Dashboard Screenshots
- `grafana-overview.png` - Main observability dashboard
- `grafana-metrics.png` - Metrics dashboard showing RPS and latency
- `grafana-traces.png` - Distributed tracing view
- `grafana-logs.png` - Log aggregation and filtering
- `grafana-profiles.png` - CPU profiling flamegraphs

### Architecture Diagrams
- `architecture-overview.png` - High-level system architecture
- `data-flow.png` - Observability data flow diagram

### Benchmark Results
- `benchmark-comparison.png` - Visual comparison of framework performance
- `performance-chart.png` - Performance metrics over time

## Usage in Documentation

To include images in markdown files:

```markdown
![Alt text](docs/images/filename.png)
```

Or with a link:

```markdown
[![Alt text](docs/images/filename.png)](docs/images/filename.png)
```

## Guidelines

- Use PNG format for screenshots (better quality)
- Use SVG for diagrams when possible (scalable)
- Keep file sizes reasonable (compress if needed)
- Use descriptive filenames
- Add alt text for accessibility
