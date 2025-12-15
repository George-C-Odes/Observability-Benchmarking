# Observability Benchmarking

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Java](https://img.shields.io/badge/Java-25-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.0.0-green.svg)](https://spring.io/projects/spring-boot)
[![Quarkus](https://img.shields.io/badge/Quarkus-3.30.3-blue.svg)](https://quarkus.io/)
[![Go](https://img.shields.io/badge/Go-1.25.5-00ADD8.svg)](https://golang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)

> A comprehensive Docker Compose-based environment for benchmarking containerized REST services with full observability using the Grafana LGTM stack (Loki, Grafana, Tempo, Mimir), continuous profiling (Pyroscope), OpenTelemetry instrumentation (Alloy), and deterministic load generation (wrk2).

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
- [Benchmarks](#-benchmarks)
  - [Running Benchmarks](#running-benchmarks)
  - [Results](#results)
  - [Test Environment](#test-environment)
  - [Interpreting Results](#interpreting-results)
- [Project Structure](#-project-structure)
- [Observability & Profiling](#-observability--profiling)
- [Code Quality & Security](#-code-quality--security)
- [Configuration](#-configuration)
- [Future Plans](#-future-plans)
- [Known Issues](#-known-issues)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

---

## 🎯 Overview

This repository provides a **production-ready Docker Compose environment** for comprehensive performance benchmarking of REST service implementations. It enables you to:

- **Compare frameworks and runtimes**: Evaluate Spring Boot, Quarkus (JVM & Native), Go, and more
- **Test concurrency models**: Platform threads, virtual threads (Project Loom), and reactive programming
- **Collect full observability data**: Logs, metrics, traces, and continuous profiling in one unified stack
- **Run deterministic benchmarks**: Use wrk2 for controlled, reproducible load testing
- **Visualize performance**: Pre-configured Grafana dashboards for deep performance insights

Perfect for developers, architects, and DevOps engineers looking to make data-driven decisions about technology stack choices, optimize application performance, or build a performance testing pipeline.

### Why This Project?

- **All-in-one solution**: No need to configure multiple observability tools separately
- **Framework agnostic**: Easily add new language implementations
- **Real-world scenarios**: Tests actual REST endpoints with caching, not synthetic benchmarks
- **Educational**: Learn how different threading models and frameworks perform under load
- **Portfolio ready**: Demonstrates expertise in performance engineering and observability

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

### 🚀 REST Service Implementations

#### Java (JDK 25 - Amazon Corretto)
- **Spring Boot 4.0.0**
  - Platform threads (traditional)
  - Virtual threads (Project Loom)
  - Reactive (WebFlux)
- **Quarkus 3.30.3**
  - JVM builds (all three thread modes)
  - Native builds with GraalVM (all three thread modes)

#### Go (1.25.5) - Work in Progress
- Fiber framework integration
- Full observability setup in progress

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
- **System Requirements**:
  - Minimum: 8 GB RAM, 4 CPU cores
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

The project uses Docker Compose profiles to control what gets deployed:

#### 1. Start Only the Observability Stack

Perfect for exploring Grafana and the LGTM stack:

```bash
docker compose --project-directory compose --profile=OBS up --no-recreate --build -d
```

**Access Grafana**: Navigate to [http://localhost:3000](http://localhost:3000)
- Default credentials: `a` / `a`

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

### Warming Up

⚠️ **Important**: Wait approximately 60 seconds after starting the stack to ensure:
- All services are fully initialized
- Grafana datasources are connected
- Observability agents are registered

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

#### Requests Per Second (Quad-CPU Limited Containers)

The following results were obtained with containers limited to 4 vCPUs for fair comparison:

| Rank | Implementation (Mode)     | RPS    | Notes |
|------|---------------------------|--------|-------|
| 1    | Quarkus JVM (reactive)    | 86,000 | Highest throughput |
| 2    | Quarkus JVM (virtual)     | 68,000 | Project Loom efficiency |
| 3    | Quarkus Native (reactive) | 56,000 | GraalVM Native Image |
| 4    | Quarkus JVM (platform)    | 56,000 | Traditional threading |
| 5    | Quarkus Native (virtual)  | 55,000 | Native + virtual threads |
| 6    | Spring JVM (virtual)      | 38,000 | Spring Boot 4.0 |
| 7    | Quarkus Native (platform) | 37,000 | Native baseline |
| 8    | Spring JVM (platform)     | 35,000 | Traditional Spring |
| 9    | Spring JVM (reactive)     | 29,000 | WebFlux |
| 10   | Spring Native (virtual)   | TBA    | In development |
| 11   | Spring Native (platform)  | TBA    | In development |
| 12   | Spring Native (reactive)  | TBA    | In development |
| -    | Go (Fiber)                | ~120k* | *Not apples-to-apples yet |

**Note on Go results**: Initial Go implementation shows impressive throughput but lacks full observability instrumentation present in Java implementations.

### Test Environment

#### Hardware & Platform
- **CPU**: Intel i9-14900HX (24 cores, 32 threads)
- **RAM**: 32 GB DDR5
- **Storage**: NVMe SSD
- **OS**: Windows 11 with WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2)
- **Container Runtime**: Docker Desktop

#### Container Configuration
- **CPU Limit**: 4 vCPUs per service container
- **Memory**: Dynamically allocated
- **Network**: Docker bridge network

#### Software Versions
- **Java JDK**: Amazon Corretto 25.0.1-al2023-headless
- **Java Native**: GraalVM Enterprise 25.0.1-ol9
- **Spring Boot**: 4.0.0
- **Quarkus**: 3.30.3
- **Go**: 1.25.5 (Fiber v2.52.10)
- **Garbage Collector**: G1GC (all Java implementations)

### Interpreting Results

⚠️ **Important Considerations**:

1. **Workload Specific**: These benchmarks test a simple non-blocking cache retrieval pattern. Real-world performance depends on:
   - Database I/O characteristics
   - Business logic complexity
   - Network latency
   - External service dependencies

2. **Relative Comparisons**: Numbers are valuable for comparing different approaches under identical conditions, not as absolute performance metrics.

3. **Cold Start Effects**: Initial benchmark runs may show different results. The `/results` directory data should be cross-referenced with Grafana metrics for accuracy.

4. **GC Configuration**: All Java implementations use G1GC. Different workloads may benefit from different collectors (ZGC, Shenandoah, etc.).

5. **Native Image Tradeoffs**: 
   - GraalVM Enterprise (Oracle) with G1GC shows ~10% better performance than Community Edition
   - Native images have faster startup but may show different throughput characteristics

6. **Profiling Overhead**: Pyroscope Java agent is disabled by default as it adds measurable overhead (especially noticeable in Spring Boot).

### Monitoring During Benchmarks

While benchmarks run, use Grafana to monitor:
- **HTTP RPS**: `http_server_request_duration_seconds_count` grouped by `service_name`
- **JVM Memory**: `jvm_memory_used_bytes` by pool and area
- **GC Activity**: `jvm_memory_used_after_last_gc_bytes`
- **Free Heap**: `sum by (service_name) (jvm_memory_committed_bytes - jvm_memory_used_bytes) / 1024 / 1024`

See [Interesting Metrics](#interesting-metrics) section below for more queries.

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

### Pyroscope - Continuous Profiling

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

# Spring Boot specific RPS
spring_request_count_total{} by (endpoint)

# Quarkus specific RPS
quarkus_request_count_total{} by (endpoint)

# JVM Memory Usage
jvm_memory_used_bytes{} by (jvm_memory_pool_name, area)

# Memory after last GC
jvm_memory_used_after_last_gc_bytes{} by (jvm_memory_pool_name)

# Free Heap (MB)
sum by (service_name) (jvm_memory_committed_bytes - jvm_memory_used_bytes) / 1024 / 1024
```

### Correlation Features

- **Log-to-Trace**: Click on log entries to view associated traces
- **Trace-to-Profile**: Jump from trace spans to CPU profiles (when Java agent enabled)
- **Metric-to-Trace**: Navigate from metric spikes to specific requests
- **Dashboard Links**: Quick navigation between related views

## 🔐 Code Quality & Security

This project implements comprehensive code quality and security practices to ensure maintainable, secure, and production-ready code.

### Code Quality

#### Checkstyle Linting
- **Configuration**: Enforces Google Java Style Guide with customizations
- **Version**: maven-checkstyle-plugin 3.6.0 with Checkstyle 12.2.0
- **Coverage**: All Java modules (Quarkus JVM, Spring JVM Netty, Spring JVM Tomcat)
- **Integration**: Runs automatically during Maven `validate` phase
- **Results**: 0 violations across all projects

**Running Checkstyle**:
```bash
# For any module
cd services/quarkus/jvm
mvn checkstyle:check

# Or across all modules
cd services/quarkus/jvm && mvn checkstyle:check
cd services/spring/jvm/netty && mvn checkstyle:check
cd services/spring/jvm/tomcat && mvn checkstyle:check
```

#### Code Standards Enforced
- **Line length**: Maximum 120 characters
- **Naming conventions**: PascalCase for classes, camelCase for methods/variables, UPPER_SNAKE_CASE for constants
- **Javadoc**: Required for all public classes and methods (20+ classes documented)
- **Formatting**: Consistent indentation (4 spaces), proper whitespace, brace placement
- **Imports**: No wildcards, no unused imports
- **Code organization**: Proper access modifiers, logical method ordering

#### Documentation
- **Comprehensive Javadoc**: All public APIs documented with parameter descriptions and return values
- **Class-level documentation**: Describes purpose, responsibility, and usage
- **Method-level documentation**: Explains functionality, parameters, exceptions
- **Inline comments**: For complex logic requiring clarification

For detailed linting setup and IDE integration, see **[docs/LINTING_AND_CODE_QUALITY.md](docs/LINTING_AND_CODE_QUALITY.md)**.

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
- **CodeQL scanning**: Automated security vulnerability detection (0 alerts)
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

| Aspect | Status | Details |
|--------|--------|---------|
| Non-root containers | ✅ Implemented | All JVM services run as UID 1001 |
| File permissions | ✅ Configured | Restrictive permissions on all artifacts |
| Hardcoded secrets | ✅ Clean | Zero secrets found in code/config |
| CodeQL scan | ✅ Passed | 0 security alerts |
| Multi-stage builds | ✅ Implemented | All Dockerfiles use multi-stage |
| Documentation | ✅ Complete | Comprehensive security guide available |

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
│   ├── spring/              # Spring Boot services
│   │   ├── jvm/             # JVM builds (tomcat, netty variants)
│   │   └── native/          # GraalVM Native builds
│   ├── quarkus/             # Quarkus services
│   │   ├── jvm/             # JVM builds (platform, virtual, reactive)
│   │   └── native/          # GraalVM Native builds
│   └── go/                  # Go services (WIP)
├── config/                  # Configuration files
│   ├── grafana/             # Grafana dashboards and provisioning
│   ├── loki/                # Loki configuration
│   └── pyroscope/           # Pyroscope profiling config
├── loadgen/                 # Load generation tools and scripts
├── results/                 # Benchmark results and outputs
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
- **`loadgen/`**: wrk2 wrappers and benchmark automation scripts
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
CPU_LIMIT=4                # vCPU limit per service container
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

#### Quarkus
- **Single deployment** serves all three thread modes (platform, virtual, reactive)
- Mode selection via endpoint routing
- Simpler configuration, fewer containers

#### Spring Boot
- **Separate deployments** for each mode
- Three containers per implementation (JVM/Native)
- More complex but mode-specific optimizations possible

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

## ⚠️ Known Issues

### OpenTelemetry & Spring Boot 4.0
**Issue**: Not all metrics are available for Spring Boot applications.

**Cause**: The OpenTelemetry Java agent and SDK are not fully compatible with Spring Boot 4.0 yet.

**Workaround**: Basic metrics are still collected. Full metric support expected in future OTel releases.

**Tracking**: [opentelemetry-java-instrumentation#14906](https://github.com/open-telemetry/opentelemetry-java-instrumentation/issues/14906)

### Quarkus Native Metrics Disappearing
**Issue**: Metrics intermittently disappear for Quarkus native builds.

**Workaround**: Restart the affected container to restore metrics collection.

**Status**: Under investigation. May be related to GraalVM native image memory management.

### Alloy eBPF Profiler on WSL2
**Issue**: eBPF profiling doesn't work with Alloy version >= 1.11.0 on Windows WSL2 Docker.

**Cause**: Kernel compatibility issues between WSL2 and newer Alloy eBPF implementations.

**Workaround**: Use Alloy version < 1.11.0 or disable eBPF profiling (other profiling methods still work).

**Tracking**: [grafana/alloy#4921](https://github.com/grafana/alloy/issues/4921)

### Profile-to-Span Correlation Reliability
**Issue**: Grafana's profile-to-span correlation is experimental and doesn't always work.

**Cause**: Feature maturity - correlation depends on precise timing and requires Pyroscope Java agent.

**Workaround**: Use profiles and traces separately for analysis. Manual correlation is still valuable.

**Status**: Grafana team is actively improving this feature.

### Cold Start Effects
**Issue**: First benchmark run may show significantly different results.

**Cause**: JVM JIT compilation, container initialization, cache warming.

**Workaround**: 
- Run a 30-60 second warm-up before collecting benchmark data
- For JVM workloads, allow 2-3 minutes for optimal JIT compilation
- Always cross-reference `/results` data with Grafana metrics

### Connectivity Errors on Startup
**Issue**: Services may log connection errors immediately after stack startup.

**Cause**: Race condition as services attempt to connect before all infrastructure is ready.

**Workaround**: Wait approximately 60 seconds after starting the observability stack before starting services.

**Status**: Normal behavior, errors self-resolve as services come online.

---

For troubleshooting help, please see existing issues or open a new one with:
- System information (OS, Docker version, hardware)
- Complete error messages and logs
- Steps to reproduce
- Expected vs actual behavior

## 🚧 Future Plans

This project is actively evolving with ambitious goals for enhanced functionality and broader coverage.

### 🎯 Short-term Goals (Next 3-6 months)

#### Additional Framework Support
- [ ] **Micronaut**: Another popular JVM framework with reactive and GraalVM support
- [ ] **Helidon**: Oracle's microservices framework (SE and MP editions)
- [ ] **Ktor**: Kotlin-based asynchronous framework
- [ ] **Complete Go implementation**: Full observability instrumentation
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

### 🌐 Medium-term Goals (6-12 months)

#### Kubernetes & Cloud Native
- [ ] **Helm charts** for easy Kubernetes deployment
- [ ] **ArgoCD manifests** for GitOps workflows
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
- [ ] **gRPC benchmarking** alongside HTTP REST
- [ ] **WebSocket performance testing**
- [ ] **GraphQL endpoint support**
- [ ] **Multiple payload sizes** and complexity levels

### 🚀 Long-term Vision (12+ months)

#### Advanced Features
- [ ] **Machine learning-based** performance anomaly detection
- [ ] **Cost analysis** comparing cloud deployment scenarios
- [ ] **Energy efficiency metrics** (especially for native vs JVM)
- [ ] **Multi-datacenter** latency simulation
- [ ] **Chaos engineering** integration (latency injection, failures)

#### Ecosystem Expansion
- [ ] **Python frameworks** (FastAPI, Django, Flask)
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
- Which frameworks/languages you'd like to see
- Feature requests and improvements
- Documentation enhancements
- Bug reports and fixes

---

**Note**: This roadmap is subject to change based on community feedback and project priorities. Timeline estimates are approximate.

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
- **Dockerfile** with clear base image and build instructions
- **README.md** describing the implementation specifics
- **Docker Compose entry** in the main compose file
- **Benchmark script** or wrk2 configuration
- **Results** from your benchmarking runs (if applicable)

### Code Style Guidelines

- **Java**: Follow Google Java Style Guide (enforced by Checkstyle)
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

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

### License Summary

- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Patent use allowed
- ✅ Private use allowed
- ⚠️ License and copyright notice required
- ⚠️ State changes required
- ❌ Trademark use not allowed
- ❌ Liability and warranty not provided

**SPDX-License-Identifier**: Apache-2.0

---

## 🙏 Acknowledgments

This project builds upon amazing open-source tools and frameworks. Special thanks to:

### Observability Stack
- [Grafana](https://github.com/grafana/grafana) - The open observability platform
- [Loki](https://github.com/grafana/loki) - Log aggregation system
- [Tempo](https://github.com/grafana/tempo) - High-scale distributed tracing
- [Mimir](https://github.com/grafana/mimir) - Scalable long-term Prometheus storage
- [Pyroscope](https://github.com/grafana/pyroscope) - Continuous profiling platform
- [Alloy](https://github.com/grafana/alloy) - OpenTelemetry distribution

### Instrumentation
- [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-java-instrumentation) - Observability framework
- [Grafana OTel Profiling Java](https://github.com/grafana/otel-profiling-java) - Java profiling integration

### Frameworks & Tools
- [Spring Boot](https://spring.io/projects/spring-boot) - Java application framework
- [Quarkus](https://quarkus.io/) - Supersonic Subatomic Java
- [wrk2](https://github.com/giltene/wrk2) - Constant throughput HTTP benchmarking tool
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
- 💬 Open an issue for bugs or questions
- 🌟 Star the repo if you find it useful!

---

<div align="center">

**Made with ❤️ for the performance engineering community**

If this project helped you, please consider giving it a ⭐️!

</div>
