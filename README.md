<!-- Generated from `README.template.md` via `scripts/render-readmes.mjs`. Do not edit `README.md` directly. -->

# Observability Benchmarking

[![📊 Benchmark Results](https://img.shields.io/badge/%F0%9F%93%8A_Benchmark_Results-Online-blue?style=for-the-badge&logo=githubpages&logoColor=white&labelColor=0D1117&color=58A6FF)](https://george-c-odes.github.io/Observability-Benchmarking/#results)

[![License](https://img.shields.io/badge/License-Apache%202.0-6E7781.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-0A84FF.svg)](https://www.docker.com/)
[![Java](https://img.shields.io/badge/Java-25.0.2-ED8B00.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.0.5-6DB33F.svg)](https://spring.io/projects/spring-boot)
[![Quarkus](https://img.shields.io/badge/Quarkus-3.34.1-6C63FF.svg)](https://quarkus.io/)
[![Micronaut](https://img.shields.io/badge/Micronaut-4.10.18-1A1A2E.svg)](https://micronaut.io/)
[![Helidon](https://img.shields.io/badge/Helidon-4.3.4-008F6B.svg)](https://helidon.io/)
[![SparkJava](https://img.shields.io/badge/SparkJava-3.0.4-FF7043.svg)](https://sparkjava.com/)
[![Javalin](https://img.shields.io/badge/Javalin-7.1.0-00AFCF.svg)](https://javalin.io/)
[![Dropwizard](https://img.shields.io/badge/Dropwizard-5.0.1-C9A200.svg)](https://www.dropwizard.io/)
[![Vert.x](https://img.shields.io/badge/Vert.x-5.0.8-782A90.svg)](https://vertx.io/)
[![Pekko](https://img.shields.io/badge/Pekko%20HTTP-1.3.0-DB2777.svg)](https://pekko.apache.org/)
[![Go](https://img.shields.io/badge/Go-1.26.1-38BDF8.svg)](https://golang.org/)
[![Python](https://img.shields.io/badge/Python-3.13.12-2F5D8C.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-6.0.3-8B2C3D.svg)](https://www.djangoproject.com/)
[![pages-build-deployment](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/pages/pages-build-deployment)
[![Deploy GitHub Pages](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/pages.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/pages.yml)
[![Qodana](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/qodana_code_quality.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/qodana_code_quality.yml)
[![Go Quality](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/go_quality.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/go_quality.yml)
[![Django Python Quality](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/django_python_quality.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/django_python_quality.yml)
[![Next.js Dashboard Quality](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/nextjs_dash_quality.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/nextjs_dash_quality.yml)
[![CodeQL](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/codeql.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/codeql.yml)
[![Java Coverage](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/java_coverage.yml/badge.svg)](https://github.com/George-C-Odes/Observability-Benchmarking/actions/workflows/java_coverage.yml)

> A comprehensive Docker Compose-based environment for **observability benchmarking** and **OpenTelemetry benchmarking** of containerized REST services with full telemetry using the **Grafana observability stack (LGTM: Loki, Grafana, Tempo, Mimir)**, continuous profiling (Pyroscope), OpenTelemetry collection (Alloy), and deterministic load generation (wrk2).

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Technology Stack Summary](#-technology-stack-summary)
- [Features](#-features)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Benchmarks](#-benchmarks)
  - [Running Benchmarks](#running-benchmarks)
  - [Results](#results)
  - [Test Environment](#test-environment)
- [Project Structure](#-project-structure)
- [Observability & Profiling](#-observability--profiling)
- [Code Quality & Security](#-code-quality--security)
- [Configuration](#-configuration)
- [Comprehensive Documentation](#-comprehensive-documentation)
- [Future Plans](#-future-plans)
- [Known Issues](#-known-issues)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

---

## 🎯 Overview

This repository provides a **production-ready Docker Compose environment** for comprehensive performance benchmarking of REST service implementations. It enables you to:

- **Compare frameworks and runtimes**: Evaluate Spring Boot, Quarkus, Micronaut, Helidon, Spark, Javalin, Dropwizard, Vert.x, Pekko (JVM & Native where applicable), Go, Django (Python), and more
- **Test concurrency models**: Platform threads, virtual threads (Project Loom), and reactive programming
- **Collect full observability data**: Logs, metrics, traces, and continuous profiling in one unified stack
- **Run deterministic benchmarks**: Use wrk2 for controlled, reproducible load testing
- **Visualize performance**: Pre-configured Grafana dashboards for deep performance insights

Perfect for developers, architects, and DevOps engineers looking to make data-driven decisions about technology stack choices, optimize application performance, or build a performance testing pipeline.

## 🧰 Technology Stack Summary

| Layer             | Category           | Technology                 | Version | Purpose / Role                                                       |
|-------------------|--------------------|----------------------------|---------|----------------------------------------------------------------------|
| **Execution**     | Runtime            | Java (Eclipse Temurin)     | 25.0.2  | Primary JVM runtime for backend services under benchmark             |
| **Execution**     | Runtime            | GraalVM                    | 25.0.2  | Native image compilation for startup and memory footprint benchmarks |
| **Execution**     | Runtime            | Go                         | 1.26.1  | High-performance baseline services for comparison                    |
| **Execution**     | Runtime            | Python (CPython)           | 3.13.12 | Interpreted runtime for Django benchmark services                    |
| **Execution**     | Server             | Gunicorn                   | 25.3.0  | Production WSGI/ASGI process manager for Django benchmark services   |
| **Execution**     | Runtime            | Node.js                    | 25.8.2  | Frontend tooling and SSR runtime                                     |
| **Backend**       | Framework          | Spring Boot                | 4.0.5   | Enterprise Java baseline framework                                   |
| **Backend**       | Framework          | Quarkus                    | 3.34.1  | Cloud-native Java framework (JVM + native image focus)               |
| **Backend**       | Framework          | Micronaut                  | 4.10.18 | Compile-time optimized JVM microservices framework                   |
| **Backend**       | Framework          | Helidon SE                 | 4.3.4   | Lightweight Java microservices (programmatic routing)                |
| **Backend**       | Framework          | Helidon MP                 | 4.3.4   | MicroProfile-compliant Java microservices (CDI + JAX-RS)             |
| **Backend**       | Framework          | SparkJava (Zoomba fork)    | 3.0.4   | Minimal HTTP server (virtual-thread friendly)                        |
| **Backend**       | Framework          | Javalin                    | 7.1.0   | Lightweight REST server                                              |
| **Backend**       | Framework          | Dropwizard                 | 5.0.1   | Production-ready RESTful web services (Jetty + Jersey + Jackson)     |
| **Backend**       | Framework          | Vert.x                     | 5.0.8   | Reactive, event-driven applications on the JVM (Netty)               |
| **Backend**       | Framework          | Pekko                      | 1.3.0   | Reactive HTTP toolkit on the Pekko actor system (Apache)             |
| **Backend**       | Framework          | Django                     | 6.0.3   | Python web framework (WSGI platform + ASGI reactive)                 |
| **Frontend**      | Framework          | Next.js                    | 16.2.1  | SSR frontend and control dashboard                                   |
| **Frontend**      | Library            | React                      | 19.2.4  | UI rendering layer                                                   |
| **Frontend**      | Language           | TypeScript                 | 5.9.3   | Type-safe frontend development                                       |
| **Frontend**      | UI Library         | Material UI (MUI)          | 7.3.9   | Component library and theming                                        |
| **Observability** | Visualization      | Grafana                    | 12.4.2  | Metrics, logs, traces dashboards                                     |
| **Observability** | Logs               | Loki                       | 3.7.1   | Log aggregation                                                      |
| **Observability** | Tracing            | Tempo                      | 2.10.3  | Distributed tracing backend                                          |
| **Observability** | Metrics            | Mimir                      | 3.0.4   | Long-term metrics storage                                            |
| **Observability** | Profiling          | Pyroscope                  | 1.19.1  | Continuous CPU and memory profiling                                  |
| **Observability** | Collection         | Grafana Alloy              | 1.10.2  | Unified telemetry collection pipelines                               |
| **Telemetry**     | Instrumentation    | OpenTelemetry SDK          | 1.60.1  | Manual metrics, logs, and traces instrumentation                     |
| **Telemetry**     | Instrumentation    | OpenTelemetry Distribution | 2.26.1  | Auto-instrumentation and exporters                                   |
| **Performance**   | Cache              | Caffeine                   | 3.2.3   | High-performance in-memory caching (Java)                            |
| **Performance**   | Cache              | cachetools                 | 7.0.5   | In-memory caching (Python)                                           |
| **Platform**      | Container Runtime  | Docker Engine              | 24+     | Container runtime for reproducible benchmarks                        |
| **Platform**      | Orchestration      | Docker Compose             | v2      | Local multi-service orchestration                                    |
| **Platform**      | Tooling            | Docker CLI                 | 29.3.1  | Image build and lifecycle management                                 |
| **Build**         | Build Tool         | Maven                      | 3.9.14  | Java build and dependency management                                 |
| **Build**         | Build Tool         | pip-compile                | Latest  | Python dependency pinning and resolution                             |
| **Build**         | Package Manager    | npm                        | 11.12.1 | Frontend dependency management                                       |
| **Quality**       | Linter / Formatter | Ruff                       | 0.15.8  | Python linting and code formatting                                   |
| **Testing**       | Load Testing       | wrk2                       | Latest  | Deterministic HTTP benchmarking                                      |
| **Testing**       | Unit / Integration | JUnit                      | 5 / 6   | JVM unit and integration testing                                     |
| **Testing**       | Frontend Testing   | Vitest                     | 4.1.2   | Frontend unit testing                                                |

### Why This Project?

- **All-in-one solution**: No need to configure multiple observability tools separately
- **Framework-agnostic**: Add new language implementations
- **Real-world scenarios**: Tests actual REST endpoints with caching, not synthetic benchmarks
- **Educational**: Learn how different threading models and frameworks perform under load
- **Portfolio ready**: Demonstrates expertise in performance engineering and observability

### Search keywords (for reach)

If you’re searching for projects like this, these are the topics it covers:

- OpenTelemetry (OTel) benchmarking
- observability benchmarking / performance engineering
- Grafana LGTM stack (Loki + Tempo + Mimir + Grafana) 
- continuous profiling (Grafana Pyroscope)
- wrk2 constant-throughput load testing
- Java virtual threads (Project Loom) vs. platform threads vs. reactive (WebFlux/Mutiny)
- Quarkus vs. Spring Boot performance
- GraalVM native image benchmarking
- Django (Python) vs. JVM framework performance
- Python WSGI vs. ASGI benchmarking

## ✨ Features

### 🏗️ Complete Observability Stack (LGTM)
- **Loki**: Centralized log aggregation and querying
- **Grafana**: Pre-configured dashboards for metrics, logs, traces, and profiles
- **Tempo**: Distributed tracing with OpenTelemetry
- **Mimir**: Long-term metrics storage and querying

### 🔍 Advanced Profiling
- **Pyroscope**: Continuous profiling with multiple collection methods:
  - Java agent-based profiling (JVM builds)
  - eBPF-based sampling (system-wide)
  - HTTP scrape endpoints

### 🎛️ Orchestration Dashboard
- **Next.js Dashboard**: Modern web UI for managing the benchmarking environment
  - Edit environment configuration (`compose/.env`) through intuitive UI
  - Configure benchmark targets via chip-based multiselect with quick-filter group buttons
  - Execute IntelliJ IDEA run configurations from the browser
  - Professional MUI-based interface with switchable themes
  - Built with Next.js 16.2.1 and Material-UI 7.3.9

### 🚀 REST Service Implementations

#### Java (JDK 25 – Eclipse Temurin)
- **Spring Boot 4.0.5 (3.5.13 also supported)**
  - JVM builds
    - Platform threads
    - Virtual threads
    - Reactive (WebFlux)
  - Native builds
    - Platform threads
    - Virtual threads
    - Reactive (WebFlux)
- **Quarkus 3.34.1**
  - JVM build (all three thread modes)
  - Native build (all three thread modes)
- **Micronaut**: 4.10.18
  - JVM build (all three thread modes)
  - Native (all three thread modes)
- **Helidon**: 4.3.4
  - SE JVM build
    - Virtual threads
  - SE Native build
    - Virtual threads
  - MP JVM build
    - Virtual threads
  - MP Native build
    - Virtual threads
- **Spark**: 3.0.4
  - JVM builds
    - Platform threads
    - Virtual threads
- **Javalin**: 7.1.0
  - JVM builds
    - Platform threads
    - Virtual threads
- **Dropwizard**: 5.0.1
  - JVM builds
    - Platform threads
    - Virtual threads
- **Vert.x**: 5.0.8
  - JVM build
    - Reactive (event-loop)
- **Pekko**: 1.3.0
  - JVM build
    - Reactive (Pekko dispatcher)

#### Go (1.26.1)
- Fiber framework integration
- Full observability setup

#### Python (3.13.12)
- **Django**: 6.0.3
  - Platform (WSGI — Gunicorn gthread workers)
  - Reactive (ASGI — Gunicorn + UvicornWorker)

### 🎯 Load Generation
- **wrk2**: Deterministic, constant-throughput HTTP benchmarking
- Configurable via `.env` file
- Scripts for reproducible test runs

### 🐳 Infrastructure
- **Docker Compose**: Complete orchestration
- **Profile-based deployment**: Run only what you need
  - `OBS`: Observability stack only
  - `SERVICES`: Include REST services
  - `RAIN_FIRE`: Add load generators
- **Resource controls**: CPU and memory limits for fair comparisons

### 📊 OpenTelemetry Integration
- Batched collection of logs, metrics, and traces
- gRPC transport for efficiency
- Alloy collector for flexible routing

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher (modern Compose CLI)

#### Required local path setting (`HOST_REPO`)

This repo is orchestrated via the `compose/` project directory.

⚠️ **Important**: in `compose/.env`, you must set `HOST_REPO` to the **absolute path** of the repository root on your machine (for example: `C:\Users\you\dev\Observability-Benchmarking`).

If `HOST_REPO` is not set correctly, bind-mounts used by the dashboard/orchestrator and benchmark tooling won’t resolve and the environment won’t start cleanly.

#### System requirements

- Minimum: 12 GB RAM, 4 CPU cores
- Recommended: 16 GB RAM, 8 CPU cores
- Storage: At least 10 GB free space

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/George-C-Odes/Observability-Benchmarking.git
   cd Observability-Benchmarking
   ```

2. **Configure environment variables** (optional)
   ```bash
   cp .env.example .env
   # Edit .env to customize benchmark parameters
   ```

### Quick Start

There are multiple supported ways to get up and running. All options ultimately use Docker Compose under `compose/`.

#### Option 1: IntelliJ IDEA Run/Debug scripts (recommended for development)

If you prefer a guided workflow and repeatable “one-click” scripts, use the provided IntelliJ Run/Debug configurations.

> Tip: this is the smoothest way to build and run native-image services because the scripts already respect the repository’s resource and ordering constraints.

#### Option 2: Docker Compose directly (terminal)

Use profiles to control what gets deployed:

#### 1. Start Only the Observability Stack

Perfect for exploring Grafana and the LGTM stack:

```bash
docker compose --project-directory compose --profile=OBS up --no-recreate --build -d
```

**Access Grafana**: Navigate to [http://localhost:3000](http://localhost:3000)
- Default credentials: `a` / `a`

**Control plane (optional)**: The Dashboard (port 3001) + Orchestrator (port 3002) are started via the `CONTROL` Compose profile.
- Docs: https://george-c-odes.github.io/Observability-Benchmarking/control-plane.html
- Example: `docker compose --project-directory compose --profile=OBS --profile=CONTROL up --no-recreate --build -d`

**Access Dashboard**: Navigate to [http://localhost:3001](http://localhost:3001)
- Orchestration UI for managing environment and running scripts

#### 2. Start Observability Stack + REST Services

Run the full stack with all implemented services:

```bash
docker compose --project-directory compose --profile=OBS --profile=SERVICES up --no-recreate --build -d
```

Services will be available on their configured ports (check `compose/docker-compose.yml` for details).

#### 3. Start Everything Including Load Generators

Run the complete benchmarking environment:

```bash
docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate --build -d
```

#### 4. Rerun Only Load Generators

To rerun benchmarks without rebuilding services:

```bash
docker compose --project-directory compose --profile=RAIN_FIRE up --force-recreate -d
```

### IntelliJ IDEA Integration

Pre-configured run configurations are available in the `.run/` directory for convenient development and testing within IntelliJ IDEA.

### Build time and resource notes (native images)

⚠️ **Native-image builds are slow and CPU intensive.** On typical developer hardware, a single native image build can take **up to ~10 minutes**, and a first-time build of all services can take **30+ minutes**.

To keep builds stable (especially on Windows + WSL2 / Docker Desktop), this repository defaults to **serial image builds**:

- `COMPOSE_PARALLEL_LIMIT=1`

Building **two native images in parallel** can exhaust RAM/CPU and has been observed to crash Docker Engine (at least in WSL2).

### Warming Up

⚠️ **Important**: Wait approximately 60 seconds after starting the stack to ensure:
- All services are fully initialized
- Grafana datasources are connected
- Observability agents are registered

### Testing

This project focuses primarily on performance benchmarking.

**Load Testing & Benchmarking**
- wrk2-based deterministic load generation with fixed request rates
- Benchmark scripts in `utils/wrk2/` directory
- Results captured in `results/` directory with timestamps and metadata
- See [Benchmarking Methodology](https://george-c-odes.github.io/Observability-Benchmarking/benchmarking.html) for detailed testing procedures

**Service Validation**
- Health check endpoints (`/actuator/health` for Spring, `/q/health` for Quarkus, `/ready` for Spark, Javalin, Dropwizard, `/hello/healthz` for Django)
- Startup validation via Docker Compose health checks
- Manual smoke testing with curl or browser

**Observability Validation**
- Metrics collection verified in Grafana dashboards
- Trace propagation checked in Tempo
- Log aggregation validated in Loki
- Profile data confirmed in Pyroscope

Traditional unit/integration testing is also present, see under integration-tests/ directory.

### 📸 Visual Overview

> **Note**: Screenshots and diagrams can be added to `docs/images/` directory. This is where you can include:
> - Grafana dashboard screenshots showing metrics, traces, and logs
> - Architecture diagrams illustrating the LGTM stack integration
> - Performance charts comparing different implementations
> - Flamegraphs from Pyroscope profiling
>
> See [docs/images/README.md](docs/images/README.md) for guidelines on adding visual assets.

## 📊 Benchmarks

### Running Benchmarks

#### Manual Benchmark Execution

You can run custom benchmarks using wrk2 directly:

```bash
# Example: 10 threads, 100 connections, 50000 requests/sec for 60 seconds
wrk -t10 -c100 -d60s -R50000 --latency http://localhost:8080/api/endpoint
```

#### Automated Benchmarking

The repository includes pre-configured load generation scripts accessible via Docker Compose profiles.

**Configuration**: Edit the `.env` file to adjust benchmark parameters:
- `WRK_THREADS`: Number of worker threads
- `WRK_CONNECTIONS`: Number of concurrent connections
- `WRK_RATE`: Target requests per second
- `WRK_DURATION`: Test duration

**Best Practices**:
- **Warm-up period**: Run for ~30 seconds before collecting data
- **JVM workloads**: Run for at least 3 minutes to allow JIT compilation
- **CPU affinity**: For mixed P/E core CPUs, consider process affinity tools (e.g., Process Lasso on Windows)
- **Avoid saturation**: Monitor host CPU/memory to ensure the host isn't the bottleneck

### Results

The numbers below are a curated summary of a representative run.

#### Requests Per Second (RPS) — 06/03/2026 (to the closest thousand)

| Framework  | Runtime | Mode       | RPS  | Peak Mem (MB) | Image Size (MB) |
|------------|---------|------------|------|---------------|-----------------|
| Spring     | JVM     | Platform   | 21k  | 552           | 246             |
| Spring     | JVM     | Virtual    | 17k  | 439           | 246             |
| Spring     | JVM     | Reactive   | 14k  | 427           | 277             |
| Spring     | Native  | Platform   | 10k  | 237           | 388             |
| Spring     | Native  | Virtual    | 11k  | 163           | 388             |
| Spring     | Native  | Reactive   | 7k   | 176           | 447             |
| Quarkus    | JVM     | Platform   | 37k  | 540           | 235             |
| Quarkus    | JVM     | Virtual    | 45k  | 540           | 235             |
| Quarkus    | JVM     | Reactive   | 49k  | 540           | 235             |
| Quarkus    | Native  | Platform   | 21k  | 270           | 636             |
| Quarkus    | Native  | Virtual    | 27k  | 270           | 636             |
| Quarkus    | Native  | Reactive   | 22k  | 270           | 636             |
| Micronaut  | JVM     | Platform   | 31k  | 441           | 193             |
| Micronaut  | JVM     | Virtual    | 38k  | 441           | 193             |
| Micronaut  | JVM     | Reactive   | 33k  | 441           | 193             |
| Micronaut  | Native  | Platform   | 17k  | 165           | 349             |
| Micronaut  | Native  | Virtual    | 17k  | 165           | 349             |
| Micronaut  | Native  | Reactive   | 15k  | 165           | 349             |
| Helidon SE | JVM     | Virtual    | 65k  | 430           | 169             |
| Helidon SE | Native  | Virtual    | 37k  | 195           | 253             |
| Helidon MP | JVM     | Virtual    | 15k  | 463           | 189             |
| Helidon MP | Native  | Virtual    | 10k  | 202           | 356             |
| Spark      | JVM     | Platform   | 35k  | 559           | 216             |
| Spark      | JVM     | Virtual    | 25k  | 395           | 216             |
| Javalin    | JVM     | Platform   | 29k  | 754           | 219             |
| Javalin    | JVM     | Virtual    | 26k  | 510           | 219             |
| Dropwizard | JVM     | Platform   | 17k  | 613           | 246             |
| Dropwizard | JVM     | Virtual    | 16k  | 529           | 246             |
| Vert.x     | JVM     | Reactive   | 52k  | 541           | 220             |
| Pekko      | JVM     | Reactive   | 30k  | 693           | 266             |
| Go         | Native  | Goroutines | 24k  | 120           | 36              |
| Django     | CPython | Platform   | 1k   | 161           | 306             |
| Django     | CPython | Reactive   | 0.7k | 200           | 309             |

> Note: The GitHub Pages landing page may show a “top RPS” number; the table above is the most up-to-date reference.

> For ranking, methodology and how to reproduce see also:
> - https://george-c-odes.github.io/Observability-Benchmarking/#results
> - https://george-c-odes.github.io/Observability-Benchmarking/benchmarking

#### Fairness Notes
- Helidon 4 is virtual-thread–first; reactive HTTP server mode was removed in v4 → other modes are N/A by design.
- Helidon JVM builds have been optimized with jlink, which reduces image size significantly.
- Helidon MP adds MicroProfile CDI/JAX-RS overhead on top of the SE engine.
- Micronaut somewhat combines reactive and virtual threads with its experimental loom carrier property (in-use for jvm, not supported in native).
- Javalin supports virtual threads (blocking on VT) but does not provide a reactive HTTP model.
- Spark Java is blocking-only in its official latest version, with also virtual threads support via its Zoomba fork.
- Dropwizard 5.x runs on Jetty 12 + Jersey 3; thread mode (platform or virtual) is selected at startup via `THREAD_MODE` env var. No reactive HTTP model.
- Vert.x 5.x is a fully reactive, event-loop–based framework (Netty); only the reactive endpoint is benchmarked — platform and virtual thread modes are N/A by design.
- Pekko 1.3.0 is a fully reactive HTTP toolkit running on the Pekko actor system's ForkJoin dispatcher; only the reactive endpoint is benchmarked — platform and virtual thread modes are N/A by design. The module uses direct Pekko HTTP.
- Django 6.0.3 runs on CPython 3.13.12 behind Gunicorn. The platform module uses `gthread` (threaded WSGI) workers; the reactive module uses `UvicornWorker` (ASGI). Python's GIL limits true parallelism; throughput is significantly lower than JVM and Go implementations — included for cross-language comparison.
- Reactive means true non-blocking HTTP pipelines (event loop and backpressure), not "blocking code wrapped in reactive types."
- Native builds use GraalVM Native Image with framework-recommended settings.
- All tests:
  - same endpoint logic
  - similar payload sizes
  - keep-alive enabled
  - no TLS
  - identical load profiles
  - inside the same docker network
- go vs. go-simple
  - You may notice a higher-RPS Go variant in the repo (`go-simple`) with results around ~60k RPS.
  - That implementation is intentionally kept out of the “like-for-like” headline comparison because it does **not** run with an observability setup equivalent to the Java services.
  - The newer Go implementation targets a more apples-to-apples comparison (OpenTelemetry + the same pipeline), so it’s the one summarized here.

### Test Environment

#### Hardware & Platform
- **CPU**: Intel i9-14900HX (24 cores, 32 threads)
- **RAM**: 32 GB DDR5
- **Storage**: NVMe SSD
- **OS**: Windows 11 with WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2)
- **Container Runtime**: Docker Desktop

#### Container Configuration
- **CPU Limit**: 2 vCPUs per service container
- **Memory**: Dynamically allocated
- **Network**: Docker bridge network

#### Software Versions
- **Java JDK**: Eclipse Temurin 25.0.2
- **Java Native**: GraalVM Enterprise 25.0.2-ol9
- **Spring Boot**: 4.0.5 (3.5.13 also supported)
- **Quarkus**: 3.34.1
- **Micronaut**: 4.10.18
- **Helidon**: 4.3.4
- **Spark**: 3.0.4
- **Javalin**: 7.1.0
- **Dropwizard**: 5.0.1
- **Vert.x**: 5.0.8
- **Pekko**: 1.3.0 (Pekko Core 1.4.0)
- **Go**: 1.26.1 (Fiber v3.1.0)
- **Python**: 3.13.12 (CPython)
- **Django**: 6.0.3 (Gunicorn 25.3.0)
- **Garbage Collector**: G1GC (all Java implementations)

## 🔒 Legal and license notes (read this)

This repository is licensed under **Apache-2.0** (see [LICENSE](LICENSE)).

However, the environment pulls and builds **third-party container images and dependencies** that are governed by their own licenses.

In particular:

- Native builds may use the Oracle GraalVM container image `container-registry.oracle.com/graalvm/native-image:25.0.2-ol9`.
- If you build/run those images, **you are responsible** for reviewing and complying with Oracle’s applicable license terms.

Nothing in this repository’s Apache-2.0 license changes the license terms of third-party dependencies or container base images.

## 🧾 Attribution, provenance, and anti-plagiarism

You’re free to fork and build upon this repository under Apache-2.0.

If you redistribute modified versions, please follow the Apache-2.0 requirements (retain notices, mark modified files, include the license).

If you cite benchmark results or reuse documentation text, please attribute the original project.

## 🔍 Observability & Profiling

This project provides comprehensive observability through the Grafana LGTM stack, enhanced with continuous profiling.

### The LGTM Stack

#### **Loki** - Log Aggregation
- Centralized log collection from all services
- Efficient log querying with LogQL
- Correlation with metrics and traces

#### **Grafana** - Visualization
- Pre-configured dashboards for each service
- Unified view of logs, metrics, traces, and profiles
- Custom dashboard creation support
- Access: [http://localhost:3000](http://localhost:3000) (credentials: `a` / `a`)

#### **Tempo** - Distributed Tracing
- OpenTelemetry-based trace collection
- End-to-end request visualization
- Span-to-log correlation

#### **Mimir** - Metrics Storage
- Long-term Prometheus metrics storage
- High-performance querying
- Cardinality management

### Pyroscope – Continuous Profiling

Pyroscope collects CPU profiles through multiple methods:

1. **Java Agent Profiling** (JVM builds)
   - Accurate method-level profiling
   - Disabled by default due to overhead
   - Enable via environment variables

2. **eBPF-based Sampling**
   - System-wide profiling
   - Lower overhead
   - Works across all languages

3. **HTTP Scrape Endpoints**
   - Pull-based profiling from exposed metrics

**Profile-to-Span Correlation**: Experimental feature linking profiles to specific traces (requires Java agent).

### OpenTelemetry Integration

All telemetry data flows through **Alloy** (Grafana's OpenTelemetry collector):

- **Batched Collection**: Efficient data aggregation
- **gRPC Transport**: High-performance data transmission
- **Auto-instrumentation**: Minimal code changes required
- **Multi-backend Support**: Send data to multiple destinations

### Interesting Metrics

Use these PromQL queries in Grafana to analyze performance:

```promql
# Total HTTP RPS across all services
http_server_request_duration_seconds_count{} by (service_name)

# JVM Memory Usage
jvm_memory_used_bytes{} by (jvm_memory_pool_name, area)

# Memory after last GC
jvm_memory_used_after_last_gc_bytes{} by (jvm_memory_pool_name)

# Free Heap (MB)
sum by (service_name) (jvm_memory_committed_bytes - jvm_memory_used_bytes) / 1024 / 1024
```

### Correlation Features

- **Log-to-Trace**: Click on log entries to view associated traces
- **Trace-to-Profile**: Jump from trace spans to CPU profiles (when the Java agent is enabled)
- **Metric-to-Trace**: Navigate from metric spikes to specific requests
- **Dashboard Links**: Quick navigation between related views

## 🔐 Code Quality & Security

This project implements comprehensive code quality and security practices to ensure maintainable, secure, and production-ready code.

### Code Quality

#### Checkstyle Linting
- **Configuration**: Enforces Google Java Style Guide with customizations
- **Version**: maven-checkstyle-plugin 3.6.0 with Checkstyle 12.2.0
- **Coverage**: All Java modules (Spring, Quarkus, Micronaut, Helidon SE, Helidon MP, Spark, Javalin, Dropwizard, Vert.x, Pekko) and the orchestrator
- **Integration**: Runs automatically during Maven `validate` phase; enforced as fatal (`failsOnError=true`, `failOnViolation=true`, `violationSeverity=warning`)
- **Results**: zero violations across all projects

**Running Checkstyle**:
```bash
# For any module
cd services/java/spring/jvm/tomcat
mvn checkstyle:check

# Or across all modules
cd services/java/spring/jvm/netty && mvn checkstyle:check
cd services/java/spring/jvm/tomcat && mvn checkstyle:check
cd services/java/quarkus/jvm && mvn checkstyle:check
cd services/java/micronaut/jvm && mvn checkstyle:check
cd services/java/helidon/se/jvm && mvn checkstyle:check
cd services/java/helidon/mp/jvm && mvn checkstyle:check
cd services/java/spark/jvm && mvn checkstyle:check
cd services/java/javalin/jvm && mvn checkstyle:check
cd services/java/dropwizard/jvm && mvn checkstyle:check
cd services/java/vertx/jvm && mvn checkstyle:check
cd services/java/pekko/jvm && mvn checkstyle:check
```

#### Code Standards Enforced
- **Line length**: Maximum 120 characters
- **Naming conventions**: PascalCase for classes, camelCase for methods/variables, UPPER_SNAKE_CASE for constants
- **Javadoc**: Required for all public classes and methods (20+ classes documented)
- **Formatting**: Consistent indentation (four spaces), proper whitespace, brace placement
- **Imports**: No wildcards, no unused imports
- **Code organization**: Proper access modifiers, logical method ordering

#### Documentation
- **Comprehensive Javadoc**: All public APIs documented with parameter descriptions and return values
- **Class-level documentation**: Describes purpose, responsibility, and usage
- **Method-level documentation**: Explains functionality, parameters, exceptions
- **Inline comments**: For complex logic requiring clarification

For detailed linting setup and IDE integration, see **[docs/LINTING_AND_CODE_QUALITY.md](docs/LINTING_AND_CODE_QUALITY.md)**.

Browse the [hosted quality reports](https://george-c-odes.github.io/Observability-Benchmarking/quality/) for the latest published HTML analysis.

### Security

#### Container Security
- **Non-root execution**: All containers run as non-root users (UID 1001)
- **OpenShift compatible**: UID/GID chosen for OpenShift compatibility
- **Minimal attack surface**: Multi-stage Docker builds exclude build tools from production images
- **Proper file permissions**:
  - Application JARs: `0644` (owner read/write, group/others read)
  - OpenTelemetry agents: `0640` (owner read/write, group read, others none)
  - Directories: `g+rX,o-rwx` (group can read/execute, no access for others)

**Example from Dockerfiles**:
```dockerfile
# Create non-root user
RUN groupadd -g 1001 spring \
    && useradd -u 1001 -g spring -M -d /nonexistent -s /sbin/nologin spring

# Set permissions
RUN chown 1001:1001 /app/app.jar && chmod 0644 /app/app.jar

# Run as non-root
USER 1001
```

#### Configuration Security
- **No hardcoded secrets**: All sensitive data verified to be externalized
- **Environment variable configuration**: Passwords, API keys, tokens via environment variables
- **Secure defaults**: Configuration files contain only non-sensitive settings
- **Verified clean**: Full repository scan performed, zero hardcoded credentials found

#### Code Security
- **CodeQL scanning**: Automated security vulnerability detection via [GitHub CodeQL](https://codeql.github.com/) across Java, Python, Go, and JavaScript/TypeScript — runs on every push, PR, and weekly schedule ([workflow](.github/workflows/codeql.yml), [hosted report](https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/))
- **Dependency management**: All dependencies explicitly versioned and managed
- **Interrupt handling**: Proper `InterruptedException` handling with interrupt status restoration
- **Input validation**: Appropriate for the workload (cache retrieval with controlled input)

#### Build Security
- **Multi-stage builds**: Separate builder and runtime stages minimize final image size
- **Base image selection**: Trusted sources (Amazon Corretto, Eclipse Temurin)
- **Package cleanup**: Build caches removed after installation
- **Minimal dependencies**: `install_weak_deps=False` prevents unnecessary packages

#### Best Practices
- **Following OWASP guidelines**: Common vulnerability prevention
- **CIS Docker Benchmark alignment**: Container security hardening
- **Security documentation**: Comprehensive security guide available
- **Incident response procedures**: Documented security event handling

For comprehensive security guidelines, configuration recommendations, and incident response procedures, see **[docs/SECURITY.md](docs/SECURITY.md)**.

### Security Summary

| Aspect              | Status        | Details                                                                                                             |
|---------------------|---------------|---------------------------------------------------------------------------------------------------------------------|
| Non-root containers | ✅ Implemented | All JVM services run as UID 1001                                                                                    |
| File permissions    | ✅ Configured  | Restrictive permissions on all artifacts                                                                            |
| Hardcoded secrets   | ✅ Clean       | Zero secrets found in code/config                                                                                   |
| CodeQL scan         | ✅ Active      | Automated via GitHub Actions ([report](https://george-c-odes.github.io/Observability-Benchmarking/quality/codeql/)) |
| Multi-stage builds  | ✅ Implemented | All Dockerfiles use multi-stage                                                                                     |
| Documentation       | ✅ Complete    | Comprehensive security guide available                                                                              |

### Development Standards

- **Testing**: Unit and integration tests available (see PR #5)
- **Documentation**: All public APIs documented with Javadoc
- **Code review**: All changes reviewed before merge
- **Continuous improvement**: Regular dependency updates and security patches

---

## 📁 Project Structure

This repository is organized for maintainability, reproducibility, and ease of contribution.

```
Observability-Benchmarking/
├── compose/                 # Docker Compose orchestration files
│   ├── docker-compose.yml   # Main compose file with profiles
│   ├── obs.yml              # Observability stack configuration
│   └── utils.yml            # Utility services
├── services/                # REST service implementations
│   ├── java/                # Java service implementations
│   │   ├── spring/              # Spring Boot services
│   │   │   ├── jvm/             # JVM builds (tomcat, netty variants)
│   │   │   └── native/          # GraalVM Native builds
│   │   ├── quarkus/             # Quarkus services
│   │   │   ├── jvm/             # JVM builds (platform, virtual, reactive)
│   │   │   └── native/          # GraalVM Native builds
│   │   ├── micronaut/           # Micronaut services
│   │   │   ├── jvm/             # JVM builds (platform, virtual, reactive)
│   │   │   └── native/          # GraalVM Native builds
│   │   ├── helidon/             # Helidon services
│   │   │   ├── se/              # Helidon SE (Níma) — programmatic routing
│   │   │   │   ├── jvm/         # JVM build (virtual threads)
│   │   │   │   └── native/      # GraalVM Native build (virtual threads)
│   │   │   └── mp/              # Helidon MP — CDI + JAX-RS
│   │   │       ├── jvm/         # JVM build (virtual threads)
│   │   │       └── native/      # GraalVM Native build (virtual threads)
│   │   ├── spark/               # SparkJava (Zoomba fork) services
│   │   │   └── jvm/             # JVM builds (platform, virtual)
│   │   ├── javalin/             # Javalin services
│   │   │   └── jvm/             # JVM builds (platform, virtual)
│   │   ├── dropwizard/          # Dropwizard services
│   │   │   └── jvm/             # JVM builds (platform, virtual)
│   │   ├── vertx/               # Vert.x services
│   │   │   └── jvm/             # JVM build (reactive)
│   │   └── pekko/               # Pekko HTTP services
│   │       └── jvm/             # JVM build (reactive)
│   ├── go/                  # Go services
│   └── python/              # Python services
│       └── django/              # Django services
│           └── gunicorn/        # Gunicorn-based builds
│               ├── common/      # Shared application package and tests
│               ├── WSGI/        # Platform-threaded (django-platform)
│               └── ASGI/        # Reactive async (django-reactive)
├── config/                  # Configuration files
│   ├── grafana/             # Grafana dashboards and provisioning
│   ├── loki/                # Loki configuration
│   └── pyroscope/           # Pyroscope profiling config
├── utils/                   # Load generation tools and scripts
├── results/                 # Benchmark results and outputs
├── scripts/                 # Repository-level helper scripts (README rendering, Pages report generation)
├── docs/                    # Additional documentation
│   ├── LINTING_AND_CODE_QUALITY.md
│   ├── SECURITY.md
│   └── STRUCTURE.md         # Detailed project structure documentation
├── data/                    # Persistent data volumes
├── .env.example             # Environment variable template
├── .run/                    # IntelliJ IDEA run configurations
├── LICENSE                  # Apache 2.0 License
└── README.md                # This file
```

### Key Directories

- **`services/`**: Each subdirectory contains a complete REST service implementation with Dockerfile, source code, and README
- **`compose/`**: Docker Compose files using profiles for flexible deployment (OBS, SERVICES, RAIN_FIRE)
- **`config/`**: Centralized configuration for all observability tools
- **`utils/`**: wrk2 wrappers and benchmark automation scripts
- **`scripts/`**: Repository-level helper scripts — README template rendering (`render-readmes.mjs`) and GitHub Pages quality report generation/assembly (`pages/` subdirectory)
- **`results/`**: Stores benchmark outputs with timestamps for reproducibility

For a comprehensive breakdown of the directory structure with detailed notes, see **[docs/STRUCTURE.md](docs/STRUCTURE.md)**.

## ⚙️ Configuration

### Environment Variables

The project uses a `.env` file for configuration. Copy `.env.example` to `.env` and adjust as needed:

```bash
# Load Generator Configuration
WRK_THREADS=10              # Number of load generator threads
WRK_CONNECTIONS=100         # Concurrent connections
WRK_RATE=50000             # Target requests per second
WRK_DURATION=60s           # Test duration

# Container Resource Limits
CPU_LIMIT=2                # vCPU limit per service container
MEMORY_LIMIT=2g            # Memory limit per service container

# Observability Configuration
GRAFANA_PORT=3000          # Grafana web UI port
LOKI_PORT=3100             # Loki API port
TEMPO_PORT=3200            # Tempo API port
PYROSCOPE_PORT=4040        # Pyroscope web UI port

# Java Configuration
JAVA_OPTS=-XX:+UseG1GC     # JVM options
PYROSCOPE_AGENT_ENABLED=false  # Enable/disable Java profiling agent
```

### Service Architecture Notes

#### Spring Boot
- **Separate deployments** for each mode
- Three containers per implementation (JVM/Native)
- More complex but mode-specific optimizations are possible

#### Quarkus
- **Single deployment** serves all three thread modes (platform, virtual, reactive)
- Mode selection via endpoint routing
- Simpler configuration, fewer containers

#### Micronaut
- **Single deployment** serves all three thread modes (platform, virtual, reactive)
- Mode selection via endpoint routing
- Simpler configuration, fewer containers

#### Helidon
- **Two flavors**: SE (programmatic routing, minimal overhead) and MP (CDI + JAX-RS, MicroProfile compliant)
- **Virtual-thread–first**: Helidon 4 removed the reactive HTTP server; every request runs on a virtual thread by default — platform and reactive modes are N/A by design
- **Shared sources**: Native modules reuse the JVM sources via `build-helper-maven-plugin`; only the build toolchain differs
- **jlink-optimised JVM builds**: Runtime image is a custom JRE with unused JDK modules stripped, yielding significantly smaller Docker images

#### Spark Java
- **Separate deployments** for two thread modes (platform, virtual)
- Two containers, only JVM build supported

#### Javalin
- **Separate deployments** for two thread modes (platform, virtual)
- Two containers, only JVM build supported

#### Dropwizard
- **Separate deployments** for two thread modes (platform, virtual)
- Two containers, only JVM build supported
- Built on Jetty 12 + Jersey 3 + Jackson; thread mode controlled via `THREAD_MODE` env var
- jlink-optimised JVM image with distroless runtime base

#### Vert.x
- **Single deployment** serving the reactive endpoint
- One container, only JVM build supported
- Fully reactive, event-loop–based framework built on Netty — no blocking, no thread-per-request
- jlink-optimised JVM image with distroless runtime base

#### Pekko
- **Single deployment** serving the reactive endpoint
- One container, only JVM build supported
- Fully reactive HTTP toolkit running on the Pekko actor system's ForkJoin dispatcher — no blocking, no thread-per-request
- Direct Pekko HTTP server for maximum throughput
- jlink-optimised JVM image with distroless runtime base

#### Django (Python)
- **Two modules** sharing a common application package (`gunicorn/common`):
  - `django-platform` — WSGI served via Gunicorn `gthread` workers (platform threads)
  - `django-reactive` — ASGI served via Gunicorn + `UvicornWorker` (async)
- Clean architecture: `api/` → `application/` → `infrastructure/` layering with ports-and-adapters cache abstraction
- OpenTelemetry SDK instrumentation (traces, metrics, logs) via `opentelemetry-instrumentation-django`
- Pyroscope profiling via `pyroscope-io` Python SDK
- `cachetools.TTLCache` (with optional plain `dict` adapter for hot-path syscall elimination)
- Python 3.13+ on CPython

### Recommendations for Production

⚠️ **This setup is optimized for local development and benchmarking**. Do NOT use these configurations in production without modifications:

- **Increase retention periods** for logs and metrics
- **Add authentication** to all services
- **Configure resource limits** based on production workload
- **Enable TLS/SSL** for all communications
- **Implement proper secrets management**
- **Set up backup strategies** for persistent data
- **Configure alerting** for critical metrics

### Heap Dumps and OOM Handling

- Out-of-memory events automatically trigger heap dump generation
- Heap dumps are stored in the container's working directory
- OOM events are logged and will cause container restart
- Review heap dumps to diagnose memory issues

## 📚 Comprehensive Documentation

Documentation is available on GitHub Pages: **[Full Documentation Site](https://george-c-odes.github.io/Observability-Benchmarking/)**

**Quick Links:**
- **[Getting Started Guide](https://george-c-odes.github.io/Observability-Benchmarking/getting-started.html)** - Step-by-step setup instructions, prerequisites, and troubleshooting
- **[System Architecture](https://george-c-odes.github.io/Observability-Benchmarking/architecture.html)** – Detailed architecture, component descriptions, and design decisions
- **[Benchmarking Methodology](https://george-c-odes.github.io/Observability-Benchmarking/benchmarking.html)** – Complete testing procedures, reproducibility guidelines, and result interpretation
- **[Tools & Technologies](https://george-c-odes.github.io/Observability-Benchmarking/tools-technologies.html)** - In-depth documentation of all frameworks, tools, and technologies used
- **[Control Plane](https://george-c-odes.github.io/Observability-Benchmarking/control-plane.html)** – Dashboard and orchestrator (the `CONTROL` Compose profile)
- **[Adding a New Service](https://george-c-odes.github.io/Observability-Benchmarking/adding-a-service.html)** – How to integrate a new benchmark target (compose + orchestrator + wrk2 + docs)
- **[Quality Reports](https://george-c-odes.github.io/Observability-Benchmarking/quality/)** – Latest published static analysis and inspection results

The documentation includes portfolio-oriented content highlighting the skills demonstrated, modern software practices, and technical capabilities of this project.

## ⚠️ Known Issues

### Alloy eBPF Profiler on WSL2
**Issue**: eBPF profiling doesn't work with Alloy version >= 1.11.0 on Windows WSL2 Docker.

**Cause**: Kernel compatibility issues between WSL2 and newer Alloy eBPF implementations.

**Workaround**: Use Alloy version < 1.11.0 or disable eBPF profiling (other profiling methods still work).

**Tracking**: [grafana/alloy#4921](https://github.com/grafana/alloy/issues/4921)

### Profile-to-Span Correlation Reliability
**Issue**: Grafana's profile-to-span correlation is experimental, doesn't always work and only supported via Java agent.

**Cause**: Feature maturity - correlation depends on precise timing and requires Pyroscope Java agent.

**Workaround**: Use profiles and traces separately for analysis. Manual correlation is still valuable.

**Status**: Grafana team is actively improving this feature.

**Reference**: [pyroscope/latest/configure-client/trace-span-profiles/java-span-profiles](https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/java-span-profiles/)

### Cold Start Effects
**Issue**: First benchmark run may show significantly different results.

**Cause**: JVM JIT compilation, container initialization, cache warming.

**Workaround**: 
- Run a 30-60-second warm-up before collecting benchmark data
- For JVM workloads, allow 2–3 minutes for optimal JIT compilation
- Always cross-reference `/results` data with Grafana metrics

### Connectivity Errors on Startup
**Issue**: Services may log connection errors immediately after stack startup.

**Cause**: Race condition as services attempt to connect before all infrastructure is ready.

**Workaround**: Wait approximately 60 seconds after starting the observability stack before starting services.

**Status**: Normal behavior, errors self-resolve as services come online.

---

For troubleshooting help, please see existing issues or open a new issue with:
- System information (OS, Docker version, hardware)
- Complete error messages and logs
- Steps to reproduce
- Expected vs. actual behavior

## 🚧 Future Plans

This project is actively evolving with ambitious goals for enhanced functionality and broader coverage.

### 🎯 Short-term Goals (Next 3–6 months)

#### Additional Framework Support
- [ ] **Python**: Flask, FastAPI, AIOHTTP implementations
- [ ] **Helm charts** for easy Kubernetes deployment
- [ ] **ArgoCD manifests** for GitOps workflows
- [ ] **Ktor**: Kotlin-based asynchronous framework
- [ ] **Rust**: Actix-web or Axum framework with OTLP integration

#### Enhanced Observability
- [ ] **JFR (Java Flight Recorder)** profiling for native builds
- [ ] **Custom Grafana dashboards** with comparative views
- [ ] **Alerting rules** for performance regressions
- [ ] **Trace exemplars** linking metrics to specific traces

#### Profiling Improvements
- [ ] **Allocation profiling** in addition to CPU profiling
- [ ] **Lock contention analysis** for concurrent workloads
- [ ] **Better profile-to-span correlation** (as Grafana matures)

### 🌐 Medium-term Goals (6–12 months)

#### Kubernetes & Cloud Native
- [ ] **Cluster-scale benchmarking** with distributed load generation
- [ ] **Multi-node performance testing** scenarios
- [ ] **Cloud provider integrations** (AWS, GCP, Azure)

#### CI/CD Integration
- [ ] **GitHub Actions workflows** for automated benchmarking
- [ ] **Performance regression detection** in PRs
- [ ] **CSV/JSON export** of benchmark results
- [ ] **Historical trend analysis** and visualization
- [ ] **Automated Docker image builds** and registry publishing

#### Protocol Support
- [ ] **HTTP/2 HTTP/3 benchmarking** Successors of HTTP/1.1
- [ ] **gRPC benchmarking** alongside HTTP REST
- [ ] **WebSocket performance testing**
- [ ] **GraphQL endpoint support**
- [ ] **Multiple payload sizes** and complexity levels

### 🚀 Long-term Vision (12+ months)

#### Advanced Features
- [ ] **Machine learning-based** performance anomaly detection
- [ ] **Cost analysis** comparing cloud deployment scenarios
- [ ] **Energy efficiency metrics** (especially for native vs. JVM)
- [ ] **Multi-datacenter** latency simulation
- [ ] **Chaos engineering** integration (latency injection, failures)

#### Ecosystem Expansion
- [ ] **Django** Uvicorn server ASGI implementation
- [ ] **Python frameworks** (FastAPI, Flask, AIOHTTP)
- [ ] **Python runtimes** (CPython-FT, Nuitka)
- [ ] **Node.js frameworks** (Express, Fastify, NestJS)
- [ ] **.NET implementations** (ASP.NET Core minimal APIs)
- [ ] **Polyglot microservices** benchmark scenarios

#### Community & Documentation
- [ ] **Interactive tutorials** and workshops
- [ ] **Video walkthroughs** of setup and analysis
- [ ] **Best practices guide** for each framework
- [ ] **Community-contributed implementations**
- [ ] **Academic paper** on methodology and findings

### 🤝 How You Can Help

Interested in contributing to these goals? See the [Contributing](#-contributing) section below or open an issue to discuss:
- Which frameworks/languages you would like to see
- Feature requests and improvements
- Documentation enhancements
- Bug reports and fixes

---


## 🤝 Contributing

Contributions are welcome and appreciated! Whether you're fixing bugs, adding features, improving documentation, or adding new framework implementations, your help makes this project better.

### How to Contribute

1. **Fork the repository** and clone your fork locally
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the project's style and conventions
4. **Test your changes** thoroughly
5. **Commit your changes**: `git commit -m "Add: brief description of changes"`
6. **Push to your fork**: `git push origin feature/your-feature-name`
7. **Open a Pull Request** with a clear description of your changes

### Adding a New Implementation

To add a new framework or language implementation, please include:

- **Source code** in the appropriate `services/<framework>/` directory
- **Dockerfile** with a clear base image and build instructions
- **README.md** describing the implementation specifics
- **Docker Compose entry** in the main compose file
- **Benchmark script** or wrk2 configuration
- **Results** from your benchmarking runs (if applicable)

### Code Style Guidelines

- **Java**: Follow Google Java Style Guide (enforced by Checkstyle)
- **Python**: Follow PEP 8 (enforced by Ruff)
- **Go**: Use `gofmt` and follow standard Go conventions
- **Docker**: Multi-stage builds preferred, pin versions explicitly
- **Documentation**: Use clear headers, code examples, and practical explanations

### Testing Contributions

Before submitting:
- Ensure Docker Compose builds successfully
- Test that services start without errors
- Verify observability data flows to Grafana
- Run a benchmark to confirm functionality
- Check that no credentials or secrets are committed
- Run Checkstyle on Java code: `mvn checkstyle:check`

### Reporting Bugs

When reporting issues, please include:
- **System details**: OS, Docker version, hardware specs
- **Steps to reproduce**: Clear, minimal reproduction steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Logs**: Relevant log excerpts (use code blocks)
- **Screenshots**: If applicable, especially for UI issues

### Feature Requests

We love new ideas! When proposing features:
- Check existing issues to avoid duplicates
- Describe the use case and benefit
- Consider implementation complexity
- Be open to discussion and refinement

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers and encourage questions
- Give credit where credit is due

## 📄 License

This project is licensed under the **Apache License 2.0** – see the [LICENSE](LICENSE) file for details.

### License Summary

- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Patent use allowed
- ✅ Private use allowed
- ⚠️ License and copyright notice required
- ⚠️ State changes required
- ❌ Trademark use is not allowed
- ❌ Liability and warranty are not provided

**SPDX-License-Identifier**: Apache-2.0

---

## 🙏 Acknowledgments

This project builds upon amazing open-source tools and frameworks. Special thanks to:

### Observability Stack
- [Grafana](https://github.com/grafana/grafana) – The open observability platform
- [Loki](https://github.com/grafana/loki) - Log aggregation system
- [Tempo](https://github.com/grafana/tempo) - High-scale distributed tracing
- [Mimir](https://github.com/grafana/mimir) - Scalable long-term Prometheus storage
- [Pyroscope](https://github.com/grafana/pyroscope) – Continuous profiling platform
- [Alloy](https://github.com/grafana/alloy) – OpenTelemetry distribution

### Instrumentation
- [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-java-instrumentation) - Observability framework
- [Grafana OTel Profiling Java](https://github.com/grafana/otel-profiling-java) – Java profiling integration

### Frameworks & Tools
- [Spring Boot](https://spring.io/projects/spring-boot) – Java application framework
- [Quarkus](https://quarkus.io/) – Supersonic Subatomic Java
- [Micronaut](https://micronaut.io/) - Compile-time optimized JVM microservices framework
- [Helidon](https://helidon.io/) – Lightweight Java microservices and APIs for cloud apps
- [Spark](https://sparkjava.com/) – Minimal HTTP server
- [Javalin](https://javalin.io/) – Lightweight REST server
- [Dropwizard](https://www.dropwizard.io/) - Production-ready RESTful web services framework
- [Vert.x](https://vertx.io/) – Reactive, event-driven applications on the JVM
- [Pekko](https://pekko.apache.org/) - Reactive HTTP toolkit on the Pekko actor system (Apache)
- [Django](https://www.djangoproject.com/) – The web framework for perfectionists with deadlines
- [wrk2](https://github.com/giltene/wrk2) – Constant throughput HTTP benchmarking tool
- [Docker](https://www.docker.com/) - Containerization platform

### Community
- All contributors who have helped improve this project
- The broader observability and performance engineering community

---

## 📧 Contact & Support

- **Repository Owner**: [@George-C-Odes](https://github.com/George-C-Odes)
- **Issues**: [GitHub Issues](https://github.com/George-C-Odes/Observability-Benchmarking/issues)
- **Discussions**: [GitHub Discussions](https://github.com/George-C-Odes/Observability-Benchmarking/discussions) *(coming soon)*

### Getting Help

- 📖 Read the [docs/STRUCTURE.md](docs/STRUCTURE.md) for detailed architecture
- 🐛 Check [Known Issues](#-known-issues) for common problems
- Open an issue for bugs or questions
- 🌟 Star the repo if you find it useful!
