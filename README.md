# Observability-Benchmarking

[<img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg">]()

A Docker Compose-based local environment for benchmarking containerised REST services under the Grafana Observability "LGTM" stack (Loki, Grafana, Tempo, Mimir), with profiling (Pyroscope), OpenTelemetry collection (Alloy), and load-generation using wrk2.

Table of contents
- Overview
- What's included
- Quick start
- Running a benchmark
- Results (RPS)
- Test environment
- Profiling and observability
- Code quality and security
- Future plans
- Contributing
- License

Overview
This repository provides a ready-to-run Docker Compose setup to evaluate and benchmark REST service implementations while collecting logs, metrics, traces, and profiles. It is aimed at local development and experimentation to compare different Java runtimes, frameworks, and thread models under high concurrency.

### What's included
- Docker Compose files to start the full LGTM stack:
  - Loki (logs), Grafana (dashboards), Tempo (traces), Mimir (metrics)
- Pyroscope for profiling (scrape, eBPF and Java agent options)
- Alloy collector configured with OpenTelemetry
- OpenTelemetry setup for batched logs, metrics and traces, everything via gRPC
- Simple handler logic: non-blocking retrieval from an in-memory Caffeine cache (designed to exercise concurrency behavior rather than business logic)
- REST service implementations in Java 25:
  - Spring Boot (4.0.0)
  - Quarkus (3.30.2)
  - Each implementation includes three thread modes: platform (standard JVM threads), virtual threads, and reactive
- REST service implementation in Go (1.25.4) - WIP
- wrk2 for deterministic load generation
- Docker containerisation and orchestration for the above

### Quick start
1. Install Docker and (modern) Docker Compose.
2. Running only the Grafana Observability Stack: 
    ```bash
    docker compose --project-directory compose --profile=OBS up --no-recreate --build -d
    ```
3. Running also the implemented services:
    ```bash
    docker compose --project-directory compose --profile=OBS --profile=SERVICES up --no-recreate --build -d
    ```
4. Running also the benchmarks:
    ```bash
    docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate --build -d
    ```
5. Open Grafana at http://localhost:3000 (default: a / a). Explore dashboards, logs, metrics, traces and profiles.
6. Use .env file to adjust parameters of the benchmark and running containers.
7. Convenient run wrk2 script - assumes corresponding containers are up [RAIN FIRE only -RECREATE]:
    ```bash
    docker compose --project-directory compose --profile RAIN_FIRE up --force-recreate -d
    ```
8. See also IntelliJ build and run configurations under .run/

### Running a benchmark
- Start the stack and ensure the target service port is exposed (e.g., 8080).
- Example wrk2 command (adjust threads/connections/rate to your machine):
- You can adjust parameters of the benchmark and running containers in the .env file.
- Capture metrics, logs, traces, and profiles in Grafana while the test runs.
- Note: adapt the command to avoid saturating your host—wrk2's rate 'WRK_RATE' requests/sec.

### Results

Requests per second on quad-CPU-limited docker containers

| Rank | Implementation (mode)     | RPS    |
|------|---------------------------|--------|
| 1    | Quarkus JVM (reactive)    | 86,000 |
| 2    | Quarkus JVM (virtual)     | 68,000 |
| 3    | Quarkus Native (reactive) | 56,000 |
| 4    | Quarkus JVM (platform)    | 56,000 |
| 5    | Quarkus Native (virtual)  | 55,000 |
| 6    | Spring JVM (virtual)      | 38,000 |
| 7    | Quarkus Native (platform) | 37,000 |
| 8    | Spring JVM (platform)     | 35,000 |
| 9    | Spring JVM (reactive)     | 29,000 |
| 10   | Spring Native (virtual)   | TBA    |
| 11   | Spring Native (platform)  | TBA    |
| 12   | Spring Native (reactive)  | TBA    |

### Interpreting results
- These numbers are raw results (rounded to the nearest thousand) reflecting a simple non-blocking cache retrieval workload under extreme concurrency on CPU-limited containers.
- They are informative for relative comparisons but not representative of every workload.
- Re-run tests on your target hardware and tune JVM/Native options accordingly when comparing.

### Test environment
- Host: Intel i9-14900HX, 32 GB RAM, NVMe, Win 11, Docker running in 6.6.87.2-microsoft-standard-WSL2
- Containers were CPU-limited (quad vCPU) for consistent comparisons
- Java JDK Distribution: Amazon Correto 25.0.1-al2023-headless
- Java Native Distribution: GraalVM Enterprise 25.0.1-ol9
- Spring Boot: 4.0.0
- Quarkus: 3.30.1
- Go: 1.25.4 (fiber v2.52.10) - WIP
- Rust: TBA

### Profiling & Observability
- Correlate logs, traces, metrics, and profiles in Grafana to find bottlenecks.
- Pyroscope collects CPU profiles via:
  - Agent-based Java profiling (pyroscope java agent, only applicable for jvm builds)
  - eBPF-based sampling
  - HTTP scrape endpoints (grafana stack)
- OpenTelemetry exporters are configured for batching and forward telemetry to Alloy / the LGTM stack.

### Notes & Recommendations
- Quarkus implementation to support all 3 modes platform / virtual / reactive is relatively simple; there is a single deployment serving all 3.
- Spring implementation is more complex, only one mode is supported per built and run configurations; hence the x3 number of deployments.
- Ports, retention, and resource limits are tuned for local testing. Do not use this configuration as-is in production.
- When reproducing benchmarks, fix JVM options and container CPU/memory limits to ensure comparability.
- If you need stricter determinism, pin container images and use a controlled test harness (lockstep start/stop and warmup runs).
- Pyroscope profile java agent is turned off by default as it adds some overhead and somewhat reduces throughput (quite noticeable in spring).
- Grafana's profile-to-span correlation is not mature enough, only works sometimes and dependent on the pyroscope java agent being enabled.
- Don't rely only on the benchmark output data under /results for conclusions, cold starts play some role. Cross-check with the request count metrics.
- .env file can be used to specify load generator parameters.
- Recommended to warm up all workers for ~30 seconds before starting the benchmark.
- Recommended to run JVM benchmarks for at least 3 minutes to ensure the JVM caches are warmed up.
- If you have a mixed a performance / efficiency CPU, research process affinity, CPU isolation options (Process Lasso for windows recommended).
- There were two types of native base images tested - Oracle Enterprise and GraalVM Community. Only the former supports G1 GC, and it seemed to be ~10% more performant than Community.
- All java implementations use G1 GC per previous point
- Heap out-of-memory events kill the container, such scenarios are captured within the app logs and also produce heapdump
- Initial implementation in Go shows ~120k RPS which would put it at the top, but not true apples-to-apples comparison yet, it is lacking the full observability steup of the others.
- To avoid connectivity errors shown in the logs, wait for about a minute after the grafana stack is up

### Known Issues
- Not all metrics present for Spring apps. This is due to the OTEL SDK used (java agent for jvm / maven dependency for native) not being fully compatible with Spring Boot 4 yet.
  - https://github.com/open-telemetry/opentelemetry-java-instrumentation/issues/14906
- Quarkus native has disappearing metrics after some time, on app reboot they reappear.
- Alloy eBPF profiler for windows wsl2 docker does not work with alloy version >= 1.11.0
  - https://github.com/grafana/alloy/issues/4921

### Interesting Metrics
- All http RPS
  - http_server_request_duration_seconds_count -> service_name
- Spring RPS
  - spring_request_count_total -> endpoint
- Quarkus RPS
  - quarkus_request_count_total -> endpoint
- Memory and Garbage Collections
  - jvm_memory_used_bytes -> jvm_memory_pool_name, area 
  - jvm_memory_used_after_last_gc_bytes -> jvm_memory_pool_name 
- Track free heap with (PromQL)
  - sum by (service_name) (jvm_memory_committed_bytes - jvm_memory_used_bytes) / 1024 / 1024

### Code Quality and Security

This project implements comprehensive code quality and security practices:

#### Code Quality
- **Checkstyle**: Enforces Google Java Style Guide with customizations
- **Javadoc**: All public classes and methods are documented
- **Consistent formatting**: Line length limits, naming conventions, and code structure rules
- See [docs/LINTING_AND_CODE_QUALITY.md](docs/LINTING_AND_CODE_QUALITY.md) for details

Run Checkstyle on any module:
```bash
cd services/quarkus/jvm
mvn checkstyle:check
```

#### Security
- **Non-root containers**: All services run as non-root users (UID 1001)
- **Secure file permissions**: Proper ownership and restricted access in containers
- **No hardcoded secrets**: All sensitive data externalized to environment variables
- **Multi-stage Docker builds**: Minimal attack surface in production images
- **Security best practices**: Following OWASP and CIS Docker Benchmark guidelines
- See [docs/SECURITY.md](docs/SECURITY.md) for comprehensive security guidelines

### Future plans
- Additional implementations: Micronaut, Helidon, Go, Rust
- Kubernetes manifests / Helm charts & ArgoCD deployment for cluster-scale benchmarking
- Reproducible CI-driven benchmarks and CSV export of results
- JFR profiling for java native builds
- gRPC protocol support alongside HTTP for load processing

### Special Thanks
- https://github.com/giltene/wrk2
- https://github.com/grafana/alloy
- https://github.com/grafana/grafana
- https://github.com/grafana/loki
- https://github.com/grafana/mimir
- https://github.com/grafana/otel-profiling-java
- https://github.com/grafana/pyroscope
- https://github.com/grafana/tempo
- https://github.com/open-telemetry/opentelemetry-java-instrumentation

### Contributing
Contributions, bug reports, and improvements are welcome. Please open issues or PRs. If you want to add a new implementation or a dashboard, include:
- A short README for the implementation
- A Dockerfile and Compose service entry
- A benchmark script or wrk2 invocation used to produce results

License
License: Apache-2.0
SPDX-License-Identifier: Apache-2.0

### Contact
- Repo owner: @George-C-Odes

### Repository layout (short)

This repository is organized to support reproducible, local, and CI benchmarking of REST services under the Grafana LGTM stack. For a complete, annotated directory tree and notes about what goes where, see docs/STRUCTURE.md.

Quick links
- Full project structure and folder responsibilities: docs/STRUCTURE.md
- How to run: see Quick start section above
- Contributing: see CONTRIBUTING.md (future)
