---
layout: default
title: Getting Started Guide
permalink: /docs/getting-started
---

# Getting Started Guide

This guide helps you set up and run the Observability Benchmarking environment on your local machine.

It’s designed for **reproducible, like-for-like performance testing** under a consistent observability pipeline (OpenTelemetry + Grafana LGTM + profiling).

## Prerequisites

### Required Software

1. **Docker Desktop** (or Docker Engine + Docker Compose)
   - Version: 24.0.0 or higher
   - Docker Compose v2 (included in Docker Desktop)
   - Download: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)

2. **System Requirements**
   - CPU: Minimum 8 cores (16 recommended for full stack)
   - RAM: Minimum 16 GB (32 GB recommended)
   - Storage: 20 GB free space
   - OS: Windows 10/11 (WSL2), macOS, or Linux

### Mandatory local path setting (`HOST_REPO`)

⚠️ This repository is orchestrated via the `compose/` project directory.

In `compose/.env`, you must set `HOST_REPO` to the **absolute path** of the repository root on your machine.

If `HOST_REPO` is incorrect, bind mounts used by the dashboard/orchestrator and benchmark tooling won’t resolve and the environment will start in a broken state.

### Native-image build time & stability notes

Native-image builds are **CPU intensive** and can take **up to ~10 minutes per service**. A first-time build of the full set of services can take **30+ minutes**.

On Windows + WSL2 / Docker Desktop, building native images in parallel can exhaust system resources and has been observed to crash Docker Engine.

For stability, the repository defaults to serial image builds:

- `COMPOSE_PARALLEL_LIMIT=1`

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 24.0.0 or higher

# Check Docker Compose version
docker compose version
# Expected: Docker Compose version v2.x.x

# Verify Docker is running
docker ps
# Should list containers (or show empty list if none running)
```

## Getting started options

There are three supported ways to run the stack. All of them ultimately use Docker Compose in `compose/`.

1. **IntelliJ IDEA Run/Debug workflow** (recommended for development)
   - Uses pre-configured run configurations under `.run/` to build and orchestrate repeatable tasks.

2. **Docker Compose from your terminal**
   - Best if you want to be explicit and scriptable.

3. **Dashboard/orchestrator-driven workflow**
   - Start the stack once, then use the Next.js dashboard (port `3001`) as a control plane to run scripts and adjust runtime configuration.

## Quick Start (5 Minutes)

### Step 1: Clone the Repository

```bash
git clone https://github.com/George-C-Odes/Observability-Benchmarking.git
cd Observability-Benchmarking
```

### Step 2: Start the Observability Stack

This launches Grafana, Loki, Tempo, Mimir, Pyroscope, and Alloy:

```bash
docker compose --project-directory compose --profile=OBS up --no-recreate --build -d
```

Expected output:
```
[+] Running 6/6
 ✔ Container grafana    Started
 ✔ Container loki       Started
 ✔ Container tempo      Started
 ✔ Container mimir      Started
 ✔ Container pyroscope  Started
 ✔ Container alloy      Started
```

**Wait 60 seconds** for all services to initialize before proceeding.

### Step 3: Access Grafana

1. Open browser: [http://localhost:3000](http://localhost:3000)
2. Default credentials: Username `a`, Password `a`
3. Explore the pre-configured dashboards and data sources

### Step 4: Start a Service

Launch a Spring Boot service with virtual threads:

```bash
docker compose --project-directory compose --profile=SERVICES up --no-recreate --build -d spring-jvm-virtual
```

Wait 30 seconds for service startup and JVM initialization.

### Step 5: Run a Benchmark

```bash
docker compose --project-directory compose --profile=RAIN_FIRE up --force-recreate -d
```

This starts wrk2 load generators targeting all running services.

### Step 6: View Results

- **Grafana**: [http://localhost:3000](http://localhost:3000) - Dashboards, metrics, logs, traces
- **Service Metrics**: Navigate to Explore → Prometheus
- **Logs**: Explore → Loki
- **Traces**: Explore → Tempo
- **Profiles**: Explore → Pyroscope

## Detailed Setup

### Configuration with .env File

Create a `.env` file in the project root for custom configuration:

#### Windows (PowerShell)

```powershell
# Copy example configuration
Copy-Item .env.example .env

# Edit with your preferred editor
notepad .env
```

#### macOS / Linux

```bash
# Copy example configuration
cp .env.example .env

# Edit with your preferred editor
nano .env
```

Example `.env` settings:

```env
# Typically container name or 'combo' for all
WRK_HOST: quarkus-jvm
# 'platform', 'virtual', 'reactive' or 'combo' for all
WRK_ENDPOINT: platform
# If false, wrk2 container still boots and available to docker exec benchmarks on demand
WRK_AUTORUN: true
# If true, wrk2 container stops after autorun completion
WRK_EXIT_AFTER_AUTORUN: false
# 0 means indefinitely
WRK_ITERATIONS: 1
# Sleep in seconds between endpoints / iterations
WRK_SLEEP_BETWEEN: 10
# Sleep in seconds on boot
WRK_SLEEP_INIT: 20

# wrk2 client number of concurrent threads
WRK_THREADS: 5
# wrk2 client number of concurrent open connections
WRK_CONNECTIONS: 200
# wrk2 client test duration (per endpoint)
WRK_DURATION: 3m
# wrk2 client target rate of requests per second, total across all threads
WRK_RATE: 120000
# If true, exports the wrk2 benchmark log to file
WRK_SAVE_LOGS: true

# Specific max number of CPU core and Memory TOTAL allocations to be used in every container of benchmarked services
CORES_LIMIT: 2
MEM_LIMIT: 768M
HEAP_MIN: 64M
HEAP_MAX: 640M
OFF_HEAP_MAX: 32M
```

### Profile-Based Deployment

The project uses Docker Compose profiles for modular deployment:

#### Profile: OBS (Observability Stack)
```bash
docker compose --project-directory compose --profile=OBS up -d
```

Includes:
- Grafana (visualization)
- Loki (logs)
- Tempo (traces)
- Mimir (metrics)
- Pyroscope (profiles)
- Alloy (collector)

#### Profile: SERVICES (REST Services)
```bash
docker compose --project-directory compose --profile=SERVICES up -d
```

Includes all service implementations:
- Spring Boot (JVM: platform, virtual, reactive)
- Spring Boot (Native: platform, virtual, reactive)
- Quarkus (JVM: platform, virtual, reactive)
- Quarkus (Native: platform, virtual, reactive)
- Spark (JVM: platform, virtual)
- Javalin (JVM: platform, virtual)
- Go

#### Profile: RAIN_FIRE (Load Generators)
```bash
docker compose --project-directory compose --profile=RAIN_FIRE up -d
```

Includes wrk2 load generators for each service.

#### Combined Profiles
```bash
# Run everything
docker compose --project-directory compose \
  --profile=OBS --profile=SERVICES --profile=RAIN_FIRE \
  up --no-recreate --build -d
```

### Starting Individual Services

```bash
# Spring Boot with virtual threads
docker compose --project-directory compose up -d spring-jvm-virtual

# Quarkus reactive (JVM)
docker compose --project-directory compose up -d quarkus-jvm-reactive

# Quarkus native with platform threads
docker compose --project-directory compose up -d quarkus-native-platform
```

### Service Endpoints

Once services are running:

- **Spring JVM (Platform)**: http://localhost:8080/hello/platform
- **Spring JVM (Virtual)**: http://localhost:8081/hello/virtual
- **Spring JVM (Reactive)**: http://localhost:8082/hello/reactive
- **Spring Native (Platform)**: http://localhost:8083/hello/platform
- **Spring Native (Virtual)**: http://localhost:8084/hello/virtual
- **Spring Native (Reactive)**: http://localhost:8085/hello/reactive
- **Quarkus JVM (Platform)**: http://localhost:8086/hello/platform
- **Quarkus JVM (Virtual)**: http://localhost:8086/hello/virtual
- **Quarkus JVM (Reactive)**: http://localhost:8086/hello/reactive
- **Quarkus Native (Platform)**: http://localhost:8087/hello/platform
- **Quarkus Native (Virtual)**: http://localhost:8087/hello/virtual
- **Quarkus Native (Reactive)**: http://localhost:8087/hello/reactive
- **Spark JVM (Platform)**: http://localhost:8088/hello/platform
- **Spark JVM (Virtual)**: http://localhost:8089/hello/virtual
- **Javalin JVM (Platform)**: http://localhost:8090/hello/platform
- **Javalin JVM (Virtual)**: http://localhost:8091/hello/virtual
- **Micronaut JVM (Platform)**: http://localhost:8092/hello/platform
- **Micronaut JVM (Virtual)**: http://localhost:8092/hello/virtual
- **Micronaut JVM (Reactive)**: http://localhost:8092/hello/reactive
- **Micronaut Native (Platform) TODO**: http://localhost:8095/hello/platform
- **Micronaut Native (Virtual) TODO**: http://localhost:8096/hello/virtual
- **Micronaut Native (Reactive) TODO**: http://localhost:8097/hello/reactive
- **Helidon JVM (Virtual) TODO**: http://localhost:8098/hello/virtual
- **Helidon Native (Virtual) TODO**: http://localhost:8099/hello/virtual
- **Go**: http://localhost:9080/hello/virtual

Health checks available at `/q/health` (Quarkus) or `/actuator/health` (Spring).

## Running Your First Benchmark

### 1. Prepare the Environment

```bash
# Ensure observability stack is running
docker compose --project-directory compose --profile=OBS ps

# Start the service you want to benchmark
docker compose --project-directory compose up -d spring-jvm-virtual
```

#### Wait / warm up (cross-platform)

- Windows PowerShell:
  - `Start-Sleep -Seconds 30`
- macOS/Linux:
  - `sleep 30`

### 2. Manual Benchmark with wrk2

```bash
# Install wrk2 (if not using Docker)
# On Ubuntu/Debian:
sudo apt-get install build-essential libssl-dev git
git clone https://github.com/giltene/wrk2.git
cd wrk2
make
sudo cp wrk /usr/local/bin/

# Run benchmark
wrk2 -t 8 -c 200 -d 180s -R 80000 --latency \
  http://localhost:8080/hello/platform
```

### 3. Automated Benchmark (Docker)

```bash
# Use the pre-configured load generator
docker compose --project-directory compose --profile=RAIN_FIRE up --force-recreate -d

# Monitor in Grafana
# Results saved to ./results/
```

### 4. Analyze Results

#### Windows (PowerShell)

```powershell
# View wrk2 output (adjust file name/path to your run)
Get-Content results\latest-benchmark.txt

# Check Docker stats
docker stats --no-stream
```

#### macOS / Linux

```bash
# View wrk2 output
cat results/latest-benchmark.txt

# Check Docker stats
docker stats --no-stream
```

## Screenshots and reporting

Screenshots (for Grafana dashboards, traces, logs, and flame graphs) are kept under `docs/images/screenshots/`.

See `docs/images/README.md` for naming and inclusion guidance.

## Next steps

- Read **Benchmarking Methodology**: `benchmarking.html`
- Review **Tools & Technologies**: `tools-technologies.html`
- If you’re adding a new benchmark target: `adding-a-service.html`
- When you publish results, store raw outputs and summaries under `results/` (see `results/README.md`).
