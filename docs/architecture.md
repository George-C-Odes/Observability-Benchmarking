---
layout: default
title: System Architecture
permalink: /docs/architecture
---

# System Architecture

## Overview

The Observability Benchmarking project is designed as a modular, cloud-native system that demonstrates modern software engineering practices. The architecture follows a layered approach with clear separation of concerns.

## Architectural Principles

### 1. Cloud-Native Design
- **Containerization First**: Every component runs in a container for consistency and portability
- **Declarative Configuration**: Infrastructure defined as code using Docker Compose
- **12-Factor App Compliance**: Configuration via environment variables, stateless services, port binding

### 2. Observability-First Approach
- **Telemetry from Day One**: All services instrumented with OpenTelemetry from the start
- **Comprehensive Coverage**: Logs, metrics, traces, and profiles collected for every service
- **Correlation**: Ability to correlate data across all telemetry signals

### 3. Performance Engineering
- **Reproducible Benchmarks**: Fixed-rate load generation with deterministic results
- **Resource Isolation**: CPU and memory limits ensure fair comparisons
- **Statistical Rigor**: Multiple runs and warm-up periods for accurate measurements

## System Components

### Load Generation Layer

**wrk2** - HTTP benchmarking tool providing constant-throughput load generation
- Deterministic rate limiting (requests per second)
- Latency distribution tracking
- Configurable connection pooling
- Thread-based concurrency control

### Service Layer

**REST Services** - Multiple implementations for comparison
- Spring Boot 4.0.2 (JVM and Native)
  - Platform threads
  - Virtual threads
  - Reactive (WebFlux - Reactor)
- Quarkus 3.31.3 (JVM and Native)
  - Platform threads
  - Virtual threads
  - Reactive (Mutiny)
- Spark 3.0.3 (JVM)
  - Platform threads
  - Virtual threads
- Javalin 6.7.0 (JVM)
  - Platform threads
  - Virtual threads
- Micronaut 4.10.14 (JVM and Native)
  - Platform threads
  - Virtual threads
  - Reactive (Reactor)
- Helidon 4.3.4 (JVM and Native)
  - WIP
- Go 1.26.0
  - Fiber framework (v2.52.11)

**Service Characteristics**:
- Simple cache retrieval workload (Caffeine)
- Non-blocking I/O where applicable
- OpenTelemetry instrumentation
- Health check endpoints
- Configurable heap and thread settings

### Collection Layer

**Grafana Alloy** - OpenTelemetry collector and distributor
- OTLP receiver (gRPC and HTTP)
- Batch processing for efficiency
- Service discovery
- eBPF-based profiling

**Pyroscope Java Agent** - Profiling agent for JVM services
- CPU profiling
- Allocation profiling
- Lock contention detection
- Integration with OpenTelemetry traces

### Storage Layer

**Loki** - Log aggregation system
- Label-based indexing
- Efficient log storage
- LogQL query language
- Integration with Grafana

**Tempo** - Distributed tracing backend
- Trace ID-based storage
- TraceQL query language
- Tag-based search
- Trace-to-metrics correlation

**Mimir** - Metrics storage (Prometheus-compatible)
- Long-term metric storage
- PromQL query engine
- High-cardinality support
- Exemplar support

**Pyroscope** - Continuous profiling storage
- Flame graph generation
- Profile aggregation
- Tag-based filtering
- Profile-to-trace correlation

### Visualization Layer

**Grafana** - Unified observability platform
- Dashboard provisioning
- Data source configuration
- Explore interface
- Alerting (future)

## Data Flow

### Telemetry Pipeline

```
Service → OpenTelemetry SDK → OTLP/gRPC → Alloy → {Loki, Tempo, Mimir}
                                                  ↓
                                              Pyroscope
                                                  ↓
                                              Grafana
```

### Profiling Pipeline (Java)

```
JVM Service → Pyroscope Agent → Pyroscope Server
                     ↓
            OpenTelemetry Context
                     ↓
                  Alloy
```

### eBPF Profiling Pipeline

```
Container → Alloy (eBPF) → Pyroscope Server
```

## Network Architecture

### Service Communication
- Services expose REST endpoints on configurable ports
- All services in the same Docker network
- Service discovery via Docker DNS

### Observability Communication
- OTLP over gRPC (preferred, lower overhead)
- HTTP fallback for compatibility
- Push-based telemetry (services push to Alloy)
- Pull-based profiling (Pyroscope scrapes endpoints)

## Resource Management

### CPU Allocation
- Benchmarked services: 4 vCPU limit
- Observability stack: Unlimited (to avoid measurement bias)
- Host: Minimum 8 cores recommended

### Memory Allocation
- Spring JVM: 512MB-1GB heap
- Quarkus JVM: 256MB-512MB heap
- Native images: 256MB max
- Observability services: Per-component tuning

### Storage
- Ephemeral by default for clean runs
- Volume mounts available for persistence
- Results exported to host filesystem

## Configuration Management

### Environment Variables
- `.env` file for global configuration
- Service-specific overrides in docker-compose
- Runtime configuration (heap size, thread count, etc.)
- Observability endpoints and credentials

### Docker Compose Profiles
- `OBS`: Observability stack only
- `SERVICES`: REST services
- `RAIN_FIRE`: Load generators
- Composable for different scenarios

## Security Considerations

### Network Isolation
- No external network access for services under test
- Observability stack accessible on localhost only
- Production deployment requires additional security

### Credentials
- Default credentials for local development only
- Environment variable override support
- Secrets management recommended for production

### Container Security
- Non-root users where applicable
- Minimal base images
- Regular dependency updates

## Scalability Considerations

### Horizontal Scaling
- Services designed to be stateless
- Load balancing ready
- Kubernetes manifests planned

### Vertical Scaling
- Configurable resource limits
- JVM tuning parameters exposed
- GC algorithm selection

## Monitoring the Monitors

### Alloy Metrics
- Processing latency
- Batch sizes
- Error rates

### Storage Metrics
- Ingestion rate
- Query performance
- Storage utilization

## Future Architecture Enhancements

### Planned Improvements
1. **Kubernetes Support**: Helm charts and operators
2. **gRPC - HTTP/2 - HTTP/3**: Additional protocols
3. **CI/CD Integration**: Automated benchmark runs
4. **Multi-region**: Distributed load generation
5. **Service Mesh**: Istio/Linkerd integration
6. **Chaos Engineering**: Fault injection
7. **Cost Analysis**: Resource utilization tracking

### Extensibility Points
- Plugin architecture for new services
- Custom metrics exporters
- Dashboard templates
- Report generators

## Technology Choices

### Why Spring Boot?
- Industry standard for enterprise Java
- Extensive ecosystem
- Multiple threading models
- Good baseline for comparison

### Why Quarkus?
- Cloud-native optimization
- Fast startup time
- Low memory footprint
- Native compilation support

### Why Grafana LGTM Stack?
- Integrated observability
- Open source
- Production-ready
- Active community

### Why Docker Compose?
- Simple local development
- Reproducible environments
- Easy to understand
- Good foundation for Kubernetes migration

## Design Trade-offs

### Performance vs. Observability
- Instrumentation adds overhead
- Batching reduces impact
- Agent-based profiling optional
- Configurable sampling rates

### Simplicity vs. Realism
- Simple cache workload for controlled testing
- Focus on concurrency behavior
- Not representative of all workloads
- Easy to understand and modify

### Local vs. Production
- Local development optimized
- Production patterns demonstrated
- Additional hardening needed for production
- Good learning environment

## References

- [The Twelve-Factor App](https://12factor.net/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Observability](https://grafana.com/docs/)
- [Container Patterns](https://kubernetes.io/docs/concepts/cluster-administration/manage-deployment/)
