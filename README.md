# Observability-Benchmarking

[<img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg">]()

A Docker Compose-based local environment for benchmarking containerised REST services under the Grafana Observability "LGTM" stack (Loki, Grafana, Tempo, Mimir), with profiling (Pyroscope), OpenTelemetry collection (Alloy), and load-generation using wrk2.

Table of contents
- Overview
- What's included
- Quick start
- Running a benchmark (example)
- Results (RPS)
- Test environment
- Profiling and observability
- Future plans
- Contributing
- License

Overview
This repository provides a ready-to-run Docker Compose setup to evaluate and benchmark REST service implementations while collecting logs, metrics, traces and profiles. It is aimed at local development and experimentation to compare different Java runtimes, frameworks and thread models under high concurrency.

What's included
- Docker Compose files to start the full LGTM stack:
  - Loki (logs), Grafana (dashboards), Tempo (traces), Mimir (metrics)
- Pyroscope for profiling (scrape, eBPF and Java agent options)
- Alloy collector configured with OpenTelemetry
- wrk2 for deterministic load generation
- Example OpenTelemetry configs for batched logs, metrics and traces
- Example dashboards and sample data for quick evaluation
- REST service implementations in Java 25:
  - Spring Boot (4.0.0)
  - Quarkus (3.29.4)
  - Each implementation includes three thread modes: platform (classic JVM threads), virtual threads, and reactive
- Simple handler logic: non-blocking retrieval from an in-memory Caffeine cache (designed to exercise concurrency behavior rather than business logic)

Quick start
1. Install Docker and (modern) Docker Compose.
2. From the repository root:
   ```bash
   docker compose up -d
   ```
3. Open Grafana at http://localhost:3000 (default: admin / admin). Explore dashboards, traces and profiles.

Running a benchmark (example)
- Start the stack and ensure the target service port is exposed (e.g., 8080).
- Example wrk2 command (adjust threads/connections/rate to your machine):
  ```bash
  # run a 60s test at a fixed request rate with latency reporting
  wrk -t8 -c1000 -d60s -R50000 --latency http://localhost:8080/
  ```
- Capture metrics, logs, traces and profiles in Grafana while the test runs.
- Note: adapt the command to avoid saturating your host—wrk2's rate (-R) is requests/sec.

Results (RPS) — quad-CPU limited containers (raw results)
Rank | Implementation (mode)              | RPS
---- | ---------------------------------- | ------
1    | Quarkus JVM (reactive)             | 86,000
2    | Quarkus JVM (virtual)              | 68,000
3    | Quarkus native (reactive)          | 56,000
4    | Quarkus JVM (platform)             | 56,000
5    | Quarkus native (virtual)           | 55,000
6    | Spring JVM (virtual)               | 38,000
7    | Quarkus native (platform)          | 37,000
8    | Spring JVM (platform)              | 35,000
9    | Spring JVM (reactive)              | 29,000

Interpreting results
- These numbers reflect a simple non-blocking cache retrieval workload under extreme concurrency on CPU-limited containers. They are informative for relative comparisons but not representative of every workload. Re-run tests on your target hardware and tune JVM/native options when comparing.

Test environment
- Host: Intel i9-14900HX, 32 GB RAM, NVMe, Win 11, Docker running in 6.6.87.2-microsoft-standard-WSL2
- Containers were CPU-limited (quad vCPU) for consistent comparisons
- Java: 25
- Spring Boot: 4.0.0
- Quarkus: 3.29.4

Profiling & observability
- Correlate logs, traces, metrics and profiles in Grafana to find bottlenecks.
- Pyroscope collects CPU profiles via:
  - Agent-based Java profiling (pyroscope java agent)
  - eBPF-based sampling (where supported)
  - HTTP scrape endpoints (for sample exporters)
- OpenTelemetry exporters are configured to batch and forward telemetry to Alloy / the LGTM stack.

Notes & recommendations
- Ports, retention, and resource limits are tuned for local testing. Do not use this configuration as-is in production.
- When reproducing benchmarks, fix JVM options and container CPU/memory limits to ensure comparability.
- If you need stricter determinism, pin container images and use a controlled test harness (lockstep start/stop and warmup runs).

Future plans
- Additional implementations: Spring native, Micronaut, Go
- Kubernetes manifests / Helm charts & ArgoCD deployment for cluster-scale benchmarking
- Reproducible CI-driven benchmarks and CSV export of results

Contributing
Contributions, bug reports and improvements are welcome. Please open issues or PRs. If you want to add a new implementation or a dashboard, include:
- A short README for the implementation
- A Dockerfile and Compose service entry
- A benchmark script or wrk2 invocation used to produce results

License
License: Apache-2.0
SPDX-License-Identifier: Apache-2.0

Contact
- Repo owner: @George-C-Odes
