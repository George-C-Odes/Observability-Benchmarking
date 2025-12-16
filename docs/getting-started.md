---
layout: default
title: Getting Started Guide
---

# Getting Started Guide

This guide will help you set up and run the Observability Benchmarking environment on your local machine.

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

```bash
# Copy example configuration
cp .env.example .env

# Edit with your preferences
nano .env
```

Example `.env` settings:

```env
# Load Generator Configuration
WRK_THREADS=8
WRK_CONNECTIONS=200
WRK_DURATION=180s
WRK_RATE=80000

# Service Configuration
SPRING_HEAP_SIZE=1024m
QUARKUS_HEAP_SIZE=512m

# Resource Limits
SERVICE_CPU_LIMIT=4.0
SERVICE_MEMORY_LIMIT=2g

# Observability Configuration
GRAFANA_PORT=3000
LOKI_PORT=3100
TEMPO_PORT=3200
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
- Quarkus (JVM: platform, virtual, reactive)
- Quarkus (Native: platform, virtual, reactive)

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

- **Spring JVM (Virtual)**: http://localhost:8081/api/cache/key1
- **Spring JVM (Platform)**: http://localhost:8082/api/cache/key1
- **Spring JVM (Reactive)**: http://localhost:8083/api/cache/key1
- **Quarkus JVM (All modes)**: http://localhost:8090/api/cache/key1
- **Quarkus Native (All modes)**: http://localhost:8091/api/cache/key1

Health checks available at `/q/health` (Quarkus) or `/actuator/health` (Spring).

## Running Your First Benchmark

### 1. Prepare the Environment

```bash
# Ensure observability stack is running
docker compose --project-directory compose --profile=OBS ps

# Start the service you want to benchmark
docker compose --project-directory compose up -d spring-jvm-virtual

# Wait for warmup
sleep 30
```

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
  http://localhost:8081/api/cache/key1
```

### 3. Automated Benchmark (Docker)

```bash
# Use the pre-configured load generator
docker compose --project-directory compose --profile=RAIN_FIRE up --force-recreate -d

# Monitor in Grafana
# Results saved to ./results/
```

### 4. Analyze Results

```bash
# View wrk2 output
cat results/latest-benchmark.txt

# Check Docker stats
docker stats --no-stream

# Grafana dashboards
# http://localhost:3000/dashboards
```

## Troubleshooting

### Services Won't Start

**Issue**: Port already in use
```
Error: bind: address already in use
```

**Solution**: Change ports in `.env` file or stop conflicting services
```bash
# Find what's using the port
lsof -i :3000
# or on Windows
netstat -ano | findstr :3000

# Kill the process or change port in .env
GRAFANA_PORT=3001
```

### Insufficient Resources

**Issue**: Containers crash or perform poorly

**Solution**: Allocate more resources to Docker
- Docker Desktop → Settings → Resources
- Increase CPU: 8+ cores
- Increase Memory: 16+ GB

### Services Not Appearing in Grafana

**Issue**: No data in dashboards

**Solution**:
1. Wait 2-3 minutes for initial data collection
2. Verify service is running: `docker ps`
3. Check Alloy logs: `docker logs alloy`
4. Verify data sources in Grafana → Configuration → Data Sources

### Build Failures

**Issue**: Docker build fails

**Solution**:
```bash
# Clear Docker build cache
docker builder prune -a

# Rebuild with no cache
docker compose --project-directory compose --profile=SERVICES build --no-cache

# Check Docker disk space
docker system df
```

### High CPU Usage

**Issue**: System becomes sluggish

**Solution**:
- Run fewer services simultaneously
- Reduce load generator rate in `.env`
- Increase cooldown time between tests

## Advanced Usage

### Custom Service Configuration

Modify service environment variables:

```bash
# Edit docker-compose.yml
services:
  spring-jvm-virtual:
    environment:
      - JAVA_OPTS=-Xmx1g -Xms512m
      - SERVER_PORT=8081
```

### Persistent Storage

By default, data is ephemeral. To persist:

```yaml
# Add to docker-compose.yml
volumes:
  grafana-storage:
  loki-storage:
  tempo-storage:

services:
  grafana:
    volumes:
      - grafana-storage:/var/lib/grafana
```

### Custom Dashboards

```bash
# Place dashboard JSON in config/grafana/dashboards/
cp my-dashboard.json config/grafana/dashboards/

# Restart Grafana
docker restart grafana
```

### Network Configuration

```bash
# Use custom network
docker network create obs-network

# Update docker-compose.yml to use custom network
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Benchmark CI

on: [push]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Start Stack
        run: |
          docker compose --project-directory compose --profile=OBS up -d
          sleep 60
          
      - name: Run Benchmark
        run: |
          docker compose --project-directory compose --profile=SERVICES up -d
          sleep 30
          docker compose --project-directory compose --profile=RAIN_FIRE up -d
          
      - name: Collect Results
        run: |
          docker cp wrk2:/results ./results
          
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: results/
```

## Next Steps

After completing setup:

1. **Explore Grafana**: Familiarize yourself with pre-built dashboards
2. **Read Architecture Docs**: Understand system design ([Architecture](architecture.html))
3. **Review Benchmarking Guide**: Learn methodology ([Benchmarking](benchmarking.html))
4. **Experiment**: Try different services and configurations
5. **Contribute**: Share improvements via GitHub

## Learning Resources

### Grafana Observability
- [Grafana Fundamentals](https://grafana.com/tutorials/grafana-fundamentals/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Tempo Tracing Guide](https://grafana.com/docs/tempo/latest/)

### Performance Testing
- [wrk2 GitHub Repository](https://github.com/giltene/wrk2)
- [How NOT to Measure Latency (Video)](https://www.youtube.com/watch?v=lJ8ydIuPFeU)

### Docker & Containers
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Container Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## Getting Help

- **GitHub Issues**: [Open an issue](https://github.com/George-C-Odes/Observability-Benchmarking/issues)
- **Discussions**: Community Q&A
- **Documentation**: This site and in-repo docs
- **Examples**: `.run/` directory has IntelliJ configurations

## Clean Up

### Stop All Services

```bash
docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE down
```

### Remove Volumes

```bash
docker compose --project-directory compose down -v
```

### Clean Docker System

```bash
# Remove unused images
docker image prune -a

# Remove all unused resources
docker system prune -a --volumes
```

---

**Ready to benchmark?** Head back to [the main page](index.html) or dive into [benchmarking methodology](benchmarking.html)!
