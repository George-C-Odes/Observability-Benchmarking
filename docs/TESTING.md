# Comprehensive Testing Guide

> Complete guide to unit tests, integration tests, and observability validation for the Observability Benchmarking project.

## Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Unit Tests](#unit-tests)
  - [Java Services (Quarkus & Spring Boot)](#java-services-quarkus--spring-boot)
  - [Go Service](#go-service)
- [Integration Tests](#integration-tests)
- [Observability Testing](#observability-testing)
- [Performance Testing](#performance-testing)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The project implements a comprehensive testing strategy covering:

1. **Unit Tests**: Validate individual REST endpoints and service logic
2. **Integration Tests**: Verify deployment setup and inter-service communication
3. **Observability Tests**: Validate metrics, traces, and logs functionality
4. **Performance Tests**: Basic smoke tests for throughput validation

### Test Coverage Summary

| Component     | Unit Tests   | Integration Tests | Observability Tests |
|---------------|--------------|-------------------|---------------------|
| Quarkus JVM   | ✅ 9 tests    | ✅ Covered         | ✅ Metrics/Traces    |
| Spring Tomcat | ✅ 6 tests    | ✅ Covered         | ✅ Metrics/Traces    |
| Spring Netty  | ✅ 3 tests    | ✅ Covered         | ✅ Metrics/Traces    |
| Go Fiber      | ✅ 5 tests    | ✅ Covered         | ✅ Planned           |
| **Total**     | **23 tests** | **15+ scenarios** | **Full stack**      |

## Test Architecture

### Testing Stack

**Java (Quarkus)**
- Testing Framework: JUnit 5
- HTTP Testing: RestAssured
- Test Profile: `@QuarkusTest`
- Metrics: Micrometer (OpenTelemetry SDK)

**Java (Spring Boot)**
- Testing Framework: JUnit 5
- HTTP Testing: MockMvc (Tomcat), WebTestClient (Netty)
- Test Context: `@SpringBootTest`
- Metrics: Micrometer (OpenTelemetry Java Agent)

**Go**
- Testing Framework: Go testing package
- HTTP Testing: httptest + Fiber Test
- Observability: OpenTelemetry Go SDK

**Integration**
- Tool: Bash script (`run-integration-tests.sh`)
- HTTP Client: curl
- Exit Codes: Standard (0=success, 1=failure)
- Output: Colored terminal output with detailed reporting

## Unit Tests

### Java Services (Quarkus & Spring Boot)

#### Version Requirements

```
Java: 25 (Amazon Corretto 25.0.1 or Eclipse Temurin 25)
Maven: 3.9+
Spring Boot: 4.0.2 (3.5.10 also supported)
Quarkus: 3.31.1
```

> **Important**: Java 25 is required. If you have a different version, use Docker builds (see below).

#### Test Structure

All Java unit tests follow a consistent pattern:

```
services/
├── quarkus/jvm/src/test/java/com/benchmarking/rest/HelloResourceTest.java
├── spring/jvm/tomcat/src/test/java/com/benchmarking/rest/HelloControllerTest.java
└── spring/jvm/netty/src/test/java/com/benchmarking/rest/HelloControllerTest.java
```

#### Running Quarkus Tests

```bash
cd services/quarkus/jvm
mvn clean test
```

**Test Coverage**:
- ✅ Platform threads (`/hello/platform`)
- ✅ Virtual threads (`/hello/virtual`)
- ✅ Reactive (Mutiny) (`/hello/reactive`)
- ✅ Query parameters (`sleep`, `log`)
- ✅ Content-Type validation (application/json)
- ✅ Response body validation

**Example Test**:
```java
@Test
public void testPlatformEndpoint() {
    given()
        .when().get("/hello/platform")
        .then()
        .statusCode(200)
        .contentType(ContentType.JSON)
        .body(containsString("Hello from Quarkus platform REST"));
}
```

**Key Features Tested**:
- Quarkus OpenTelemetry SDK integration (not Java agent)
- Micrometer metrics with custom counter (`hello.request.count`)
- Caffeine cache initialization (50,000 entries)
- Thread model validation

#### Running Spring Boot Tomcat Tests

```bash
cd services/spring/jvm/tomcat
mvn clean test
```

**Test Coverage**:
- ✅ Platform threads (`/hello/platform`)
- ✅ Virtual threads (`/hello/virtual`)
- ✅ Query parameters (`sleep`, `log`)
- ✅ MockMvc integration
- ✅ Auto-configuration validation

**Example Test**:
```java
@Test
public void testPlatformEndpoint() throws Exception {
    mockMvc.perform(get("/hello/platform"))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(content().string(containsString("Hello from Boot platform REST")));
}
```

**Key Features Tested**:
- Spring Boot 4.0.2 with OpenTelemetry Java Agent
- Micrometer metrics integration
- Platform vs Virtual thread behavior
- POM refactoring (no parent dependency)

#### Running Spring Boot Netty Tests

```bash
cd services/spring/jvm/netty
mvn clean test
```

**Test Coverage**:
- ✅ Reactive endpoint (`/hello/reactive`)
- ✅ WebFlux with WebTestClient
- ✅ Reactor Netty integration
- ✅ Non-blocking I/O validation

**Example Test**:
```java
@Test
public void testReactiveEndpoint() {
    webTestClient.get()
        .uri("/hello/reactive")
        .exchange()
        .expectStatus().isOk()
        .expectHeader().contentType(MediaType.APPLICATION_JSON)
        .expectBody(String.class)
        .value(body -> assertThat(body).contains("Hello from Boot reactive REST"));
}
```

**Key Features Tested**:
- Spring WebFlux reactive programming model
- Netty event loop configuration
- Reactor context propagation

#### Running All Java Tests

```bash
# From project root
cd services/quarkus/jvm && mvn test && cd -
cd services/spring/jvm/tomcat && mvn test && cd -
cd services/spring/jvm/netty && mvn test && cd -
```

#### Docker-Based Testing (Recommended)

Build with Docker to ensure correct Java version:

```bash
# Quarkus JVM
docker build \
  --build-arg QUARKUS_VERSION=3.31.1 \
  --target builder \
  -t quarkus-jvm-test \
  -f services/quarkus/jvm/Dockerfile \
  services

# Spring Boot Tomcat
docker build \
  --build-arg SPRING_BOOT_VERSION=4.0.2 \
  --build-arg PROFILE=tomcat \
  --target builder \
  -t spring-tomcat-test \
  -f services/spring/jvm/Dockerfile \
  services

# Spring Boot Netty
docker build \
  --build-arg SPRING_BOOT_VERSION=4.0.2 \
  --build-arg PROFILE=netty \
  --target builder \
  -t spring-netty-test \
  -f services/spring/jvm/Dockerfile \
  services
```

**Note**: Docker builds run tests automatically as part of the Maven build process.

### Go Service

#### Version Requirements

```
Go: 1.25.6+
Fiber: v2.52.10
OpenTelemetry: Latest stable
```

#### Test Structure

```
services/go/hello/cmd/server/main_test.go
```

#### Running Go Tests

```bash
cd services/go/hello

# Download dependencies (first time only)
go mod download

# Run tests with verbose output
go test ./... -v

# Run tests with coverage
go test ./... -cover

# Run specific test
go test -run TestPlatformEndpoint -v
```

**Test Coverage**:
- ✅ HTTP endpoint (`/hello/platform`)
- ✅ Cache initialization and validation
- ✅ OpenTelemetry meter provider setup
- ✅ OpenTelemetry tracer provider setup
- ✅ Fiber framework integration

**Example Test Output**:
```
=== RUN   TestPlatformEndpoint
--- PASS: TestPlatformEndpoint (0.00s)
=== RUN   TestPlatformEndpointWithCache
--- PASS: TestPlatformEndpointWithCache (0.00s)
=== RUN   TestInitNumberCache
--- PASS: TestInitNumberCache (0.00s)
=== RUN   TestInitMeterProvider
    main_test.go:112: Expected error in test environment: context deadline exceeded
--- PASS: TestInitMeterProvider (5.00s)
=== RUN   TestInitTracerProvider
    main_test.go:127: Expected error in test environment: context deadline exceeded
--- PASS: TestInitTracerProvider (5.00s)
PASS
ok      hello/cmd/server        10.015s
```

**Key Features Tested**:
- Fiber web framework integration
- OpenTelemetry SDK (not automatic instrumentation)
- Custom metric counter (`hello.request.count`)
- Cache performance (map-based)

**Note**: OpenTelemetry provider tests expect timeout errors in unit test environment (no OTLP endpoint available).

## Integration Tests

Integration tests validate the entire deployment stack including Docker containers, networking, and observability components.

### Location

```
integration-tests/
├── run-integration-tests.sh    # Main test script
└── README.md                    # Detailed documentation
```

### Prerequisites

Before running integration tests:

1. **Docker & Docker Compose**
   ```bash
   docker --version  # 20.10+
   docker compose version  # 2.0+
   ```

2. **Required Tools**
   ```bash
   curl --version
   jq --version  # Optional, for JSON parsing
   ```

3. **Port Availability**
   Ensure these ports are free:
   - 8080-8087: Service ports
   - 3000: Grafana
   - 4317, 4318: OTLP endpoints

### Starting Services

```bash
# Start all services and observability stack
docker compose \
  --project-directory compose \
  --profile=OBS \
  --profile=SERVICES \
  up --build -d

# Check service status
docker compose --project-directory compose ps

# View logs
docker compose --project-directory compose logs -f quarkus-jvm
```

**Wait Time**: Allow 30-60 seconds for all services to initialize.

### Running Integration Tests

#### Basic Usage

```bash
cd integration-tests
./run-integration-tests.sh
```

#### Custom Configuration

```bash
# Override service URLs
# Spring JVM Services
export SPRING_TOMCAT_PLATFORM_URL=http://localhost:8080
export SPRING_TOMCAT_VIRTUAL_URL=http://localhost:8081
export SPRING_NETTY_URL=http://localhost:8082

# Spring Native Services
export SPRING_NATIVE_TOMCAT_PLATFORM_URL=http://localhost:8083
export SPRING_NATIVE_TOMCAT_VIRTUAL_URL=http://localhost:8084
export SPRING_NATIVE_NETTY_URL=http://localhost:8085

# Quarkus Services
export QUARKUS_JVM_URL=http://localhost:8086
export QUARKUS_NATIVE_URL=http://localhost:8087

# Go Service
export GO_URL=http://localhost:8088

# Observability
export GRAFANA_URL=http://localhost:3000
export ALLOY_URL=http://localhost:12345
export LOKI_URL=http://localhost:3100
export MIMIR_URL=http://localhost:9009
export TEMPO_URL=http://localhost:3200
export PYROSCOPE_URL=http://localhost:4040

# Orchestration
export NEXTJS_URL=http://localhost:3001
export ORCHESTRATOR_URL=http://localhost:3002

# Run tests
./run-integration-tests.sh
```

#### Selective Testing

```bash
# Test only specific service
QUARKUS_URL=http://localhost:8086 ./run-integration-tests.sh

# Skip observability tests (services only)
SKIP_OBSERVABILITY=true ./run-integration-tests.sh
```

### Test Scenarios

#### Deployment Verification (7 scenarios)

| Test                   | Endpoint          | Validation                |
|------------------------|-------------------|---------------------------|
| Quarkus Platform       | `/hello/platform` | Status 200, JSON, content |
| Quarkus Virtual        | `/hello/virtual`  | Status 200, JSON, content |
| Quarkus Reactive       | `/hello/reactive` | Status 200, JSON, content |
| Spring Tomcat Platform | `/hello/platform` | Status 200, JSON, content |
| Spring Tomcat Virtual  | `/hello/virtual`  | Status 200, JSON, content |
| Spring Netty Reactive  | `/hello/reactive` | Status 200, JSON, content |
| Go Platform            | `/hello/platform` | Status 200, content       |

#### Observability Verification (8+ scenarios)

| Test                 | Component               | Validation                  |
|----------------------|-------------------------|-----------------------------|
| Metrics Collection   | Prometheus endpoints    | Metric availability, format |
| Custom Counters      | All services            | `hello_request_count_total` |
| Health Endpoints     | All services            | Readiness, liveness         |
| Grafana UI           | Dashboard               | HTTP 200, UI accessible     |
| Grafana Data Sources | Prometheus, Loki, Tempo | Connected, healthy          |
| Trace Generation     | Tempo                   | Spans created (smoke test)  |
| Log Aggregation      | Loki                    | Logs collected (smoke test) |

### Expected Output

```
==========================================
Integration Test Suite
==========================================
Testing Framework Versions:
- Quarkus: 3.31.1
- Spring Boot: 4.0.2
- Go: 1.25.6

==========================================
Deployment Verification Tests
==========================================

--- Quarkus JVM Service (port 8086) ---
✓ Platform endpoint test passed
✓ Virtual endpoint test passed
✓ Reactive endpoint test passed

--- Spring Boot Tomcat (Platform - port 8080) ---
✓ Platform endpoint test passed

--- Spring Boot Tomcat (Virtual - port 8081) ---
✓ Virtual endpoint test passed

--- Spring Boot Netty (port 8082) ---
✓ Reactive endpoint test passed

--- Go Fiber (port 8083) ---
✓ Platform endpoint test passed

==========================================
Observability Mechanism Tests
==========================================

--- Metrics Collection ---
✓ Quarkus metrics endpoint accessible
✓ Spring Tomcat Platform metrics endpoint accessible
✓ Spring Tomcat Virtual metrics endpoint accessible
✓ Spring Netty metrics endpoint accessible
✓ Custom counter 'hello.request.count' found in services

--- Grafana Stack Health ---
✓ Grafana UI accessible (http://localhost:3000)
✓ Prometheus data source connected
✓ Loki data source connected
✓ Tempo data source connected

--- Trace Generation (Smoke Test) ---
✓ Sample requests sent for trace generation
✓ Traces should be visible in Grafana Tempo

==========================================
Test Summary
==========================================
Total Tests: 18
Passed: 18
Failed: 0
==========================================

✅ All integration tests passed!

Next Steps:
1. Open Grafana: http://localhost:3000 (credentials: a/a)
2. View metrics in Explore → Prometheus
3. View traces in Explore → Tempo
4. View logs in Explore → Loki
```

### Troubleshooting Integration Tests

#### Services Not Ready

```bash
# Check if containers are running
docker compose --project-directory compose ps

# Check service logs
docker compose --project-directory compose logs quarkus-jvm

# Wait longer for startup
sleep 60
./run-integration-tests.sh
```

#### Port Conflicts

```bash
# Find what's using a port
sudo lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use different ports in docker-compose.yml
```

#### Network Issues

```bash
# Check Docker network
docker network ls
docker network inspect compose_default

# Recreate network
docker compose --project-directory compose down
docker compose --project-directory compose up -d
```

#### Test Failures

```bash
# Run with verbose curl output
export VERBOSE=true
./run-integration-tests.sh

# Test individual endpoint
curl -v http://localhost:8086/hello/platform

# Check metrics manually
curl http://localhost:8086/q/metrics
```

## Observability Testing

### Metrics Validation

#### Java Services (Micrometer + OpenTelemetry)

**Prometheus Endpoint**: `/actuator/prometheus` (Spring) or `/q/metrics` (Quarkus)

**Key Metrics to Validate**:

```bash
# Custom application counter
hello_request_count_total{endpoint="/hello/platform"} 42

# JVM metrics (if enabled)
jvm_memory_used_bytes{area="heap"} 134217728
jvm_gc_pause_seconds_count 5
jvm_threads_states_threads{state="runnable"} 8

# HTTP server metrics (Micrometer)
http_server_requests_seconds_count{uri="/hello/platform"} 42
http_server_requests_seconds_sum 0.523

# Process metrics
process_cpu_usage 0.25
process_uptime_seconds 300
```

**Testing Metrics**:

```bash
# Quarkus
curl http://localhost:8086/q/metrics | grep hello_request_count

# Spring Tomcat
curl http://localhost:8080/actuator/prometheus | grep hello_request_count

# Spring Netty
curl http://localhost:8082/actuator/prometheus | grep hello_request_count
```

#### Go Service

**Metrics Endpoint**: Built-in OpenTelemetry exporter

**Key Metrics**:

```bash
# Custom application counter
hello_request_count_total 42

# Runtime metrics
go_goroutines 15
go_memstats_alloc_bytes 2097152
```

**Note**: Go service metrics are exported to OTLP endpoint (Alloy), not HTTP endpoint.

### Trace Validation

#### Generating Traces

```bash
# Send requests to generate traces
for i in {1..10}; do
  curl http://localhost:8086/hello/platform
  curl http://localhost:8080/hello/platform
  curl http://localhost:8082/hello/reactive
done

# Wait for trace export (5-10 seconds)
sleep 10
```

#### Viewing Traces in Grafana

1. Open Grafana: http://localhost:3000
2. Login: a/a
3. Go to Explore
4. Select data source: Tempo
5. Search for recent traces
6. Inspect span details:
   - Service name
   - Operation name
   - Duration
   - Attributes
   - Events

#### Trace Characteristics

**Quarkus JVM**:
- Service name: `quarkus-jvm`
- Instrumentation: Quarkus OpenTelemetry SDK
- Span names: `GET /hello/platform`, `hello-handler`

**Spring Boot**:
- Service name: `spring-jvm-tomcat-platform`, `spring-jvm-netty`
- Instrumentation: OpenTelemetry Java Agent
- Span names: `GET /hello/platform`, servlet/webflux spans

**Go**:
- Service name: `go-hello-fiber`
- Instrumentation: OpenTelemetry Go SDK
- Span names: `hello-handler`

### Log Validation

#### Viewing Logs in Grafana

1. Open Grafana: http://localhost:3000
2. Go to Explore
3. Select data source: Loki
4. Query: `{service_name="quarkus-jvm"}`
5. Filter by log level: `|= "INFO"` or `|= "ERROR"`

#### Log Format

**Java Services**:
```
2025-12-16T10:30:00.123Z INFO  [thread-1] c.b.r.HelloResource : Init thread: Thread[#95,executor-thread-1,5,main]
2025-12-16T10:30:01.456Z INFO  [thread-1] c.b.r.HelloResource : Heap in MB = Max:1280, Total:512, Free:256
```

**Go Service**:
```
2025-12-16T10:30:00.123Z Runtime version: go1.25.6 | Build version: go1.25.6
2025-12-16T10:30:00.456Z Server started on :8080
```

#### Log Aggregation Test

```bash
# Generate logs
for i in {1..100}; do
  curl "http://localhost:8086/hello/platform?log=true"
done

# Query logs in Grafana
# Filter: {service_name="quarkus-jvm"} |= "platform thread"
```

## Performance Testing

### Load Testing with wrk2

The project includes wrk2 for deterministic load testing.

#### Basic Load Test

```bash
# Start services
docker compose --project-directory compose --profile=SERVICES up -d

# Wait for warmup
sleep 30

# Run load test (10k RPS, 30 seconds, 4 connections, 16 threads)
docker run --rm --network compose_default \
  williamyeh/wrk2:latest \
  -t16 -c4 -d30s -R10000 --latency \
  http://quarkus-jvm:8080/hello/platform
```

#### Expected Performance

Based on 4 vCPU limits:

| Service            | Thread Model | RPS (approx) | p99 Latency |
|--------------------|--------------|--------------|-------------|
| Quarkus JVM        | Reactive     | 86,000       | <5ms        |
| Quarkus JVM        | Virtual      | 68,000       | <10ms       |
| Quarkus Native     | Reactive     | 56,000       | <3ms        |
| Spring Boot Tomcat | Platform     | 48,000       | <15ms       |
| Spring Boot Netty  | Reactive     | 52,000       | <8ms        |

#### Performance Test Validation

```bash
# Run test
./utils/wrk2/run-test.sh quarkus-jvm

# Check results
cat results/quarkus-jvm-$(date +%Y%m%d).txt

# Validate in Grafana
# - Check request rate in Prometheus
# - Check error rate (should be 0%)
# - Check resource usage (CPU, memory)
# - Check GC pauses (should be minimal)
```

## CI/CD Integration

### GitHub Actions

#### Full Test Workflow

```yaml
name: Comprehensive Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests-java:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Java 25
        uses: actions/setup-java@v4
        with:
          java-version: '25'
          distribution: 'corretto'
      
      - name: Test Quarkus JVM
        run: |
          cd services/quarkus/jvm
          mvn clean test
      
      - name: Test Spring Boot Tomcat
        run: |
          cd services/spring/jvm/tomcat
          mvn clean test
      
      - name: Test Spring Boot Netty
        run: |
          cd services/spring/jvm/netty
          mvn clean test
      
      - name: Upload Test Reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: java-test-reports
          path: '**/target/surefire-reports/**'

  unit-tests-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Go 1.25.6
        uses: actions/setup-go@v5
        with:
          go-version: '1.25.6'
      
      - name: Test Go Service
        run: |
          cd services/go/hello
          go mod download
          go test ./... -v -cover -coverprofile=coverage.out
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./services/go/hello/coverage.out
          flags: go-service

  integration-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests-java, unit-tests-go]
    steps:
      - uses: actions/checkout@v4
      
      - name: Start Services
        run: |
          docker compose --project-directory compose --profile=OBS --profile=SERVICES up -d
          sleep 60
      
      - name: Run Integration Tests
        run: |
          cd integration-tests
          chmod +x run-integration-tests.sh
          ./run-integration-tests.sh
      
      - name: Collect Container Logs
        if: failure()
        run: |
          mkdir -p logs
          docker compose --project-directory compose logs > logs/docker-compose.log
      
      - name: Upload Logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-logs
          path: logs/

  docker-build-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - { name: quarkus-jvm, context: services, dockerfile: services/quarkus/jvm/Dockerfile, version: "3.31.1" }
          - { name: spring-tomcat, context: services, dockerfile: services/spring/jvm/Dockerfile, profile: tomcat, version: "4.0.2" }
          - { name: spring-netty, context: services, dockerfile: services/spring/jvm/Dockerfile, profile: netty, version: "4.0.2" }
          - { name: go, context: services/go/hello, dockerfile: services/go/hello/Dockerfile, version: "1.25.6" }
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Build ${{ matrix.service.name }}
        run: |
          if [ "${{ matrix.service.name }}" = "quarkus-jvm" ]; then
            docker build \
              --build-arg QUARKUS_VERSION=${{ matrix.service.version }} \
              -f ${{ matrix.service.dockerfile }} \
              -t ${{ matrix.service.name }}:test \
              ${{ matrix.service.context }}
          elif [ "${{ matrix.service.name }}" = "go" ]; then
            docker build \
              --build-arg GO_VERSION=${{ matrix.service.version }} \
              -f ${{ matrix.service.dockerfile }} \
              -t ${{ matrix.service.name }}:test \
              ${{ matrix.service.context }}
          else
            docker build \
              --build-arg SPRING_BOOT_VERSION=${{ matrix.service.version }} \
              --build-arg PROFILE=${{ matrix.service.profile }} \
              -f ${{ matrix.service.dockerfile }} \
              -t ${{ matrix.service.name }}:test \
              ${{ matrix.service.context }}
          fi
      
      - name: Verify Build
        run: docker images | grep ${{ matrix.service.name }}
```

### GitLab CI

```yaml
stages:
  - test
  - integration
  - build

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"
  GOPATH: "$CI_PROJECT_DIR/.go"

cache:
  paths:
    - .m2/repository/
    - .go/pkg/mod/

test:quarkus:
  stage: test
  image: amazoncorretto:25
  script:
    - cd services/quarkus/jvm
    - mvn clean test
  artifacts:
    reports:
      junit: services/quarkus/jvm/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:spring-tomcat:
  stage: test
  image: amazoncorretto:25
  script:
    - cd services/spring/jvm/tomcat
    - mvn clean test
  artifacts:
    reports:
      junit: services/spring/jvm/tomcat/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:spring-netty:
  stage: test
  image: amazoncorretto:25
  script:
    - cd services/spring/jvm/netty
    - mvn clean test
  artifacts:
    reports:
      junit: services/spring/jvm/netty/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:go:
  stage: test
  image: golang:1.25.6
  script:
    - cd services/go/hello
    - go mod download
    - go test ./... -v -cover
  coverage: '/coverage: \d+.\d+% of statements/'

integration:
  stage: integration
  image: docker:latest
  services:
    - docker:dind
  before_script:
    - apk add --no-cache docker-compose curl bash
  script:
    - docker compose --project-directory compose --profile=OBS --profile=SERVICES up -d
    - sleep 60
    - cd integration-tests
    - chmod +x run-integration-tests.sh
    - ./run-integration-tests.sh
  after_script:
    - docker compose --project-directory compose logs > integration-logs.txt
  artifacts:
    when: on_failure
    paths:
      - integration-logs.txt
    expire_in: 1 week

build:docker:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  parallel:
    matrix:
      - SERVICE: [quarkus-jvm, spring-tomcat, spring-netty, go]
  script:
    - docker build -t $SERVICE:$CI_COMMIT_SHA -f services/$SERVICE/Dockerfile services/
  only:
    - main
    - tags
```

## Troubleshooting

### Common Issues

#### 1. Java Version Mismatch

**Problem**: Tests fail with `Unsupported class file major version`

**Solution**:
```bash
# Check Java version
java -version

# Install Java 25
# - Amazon Corretto: https://docs.aws.amazon.com/corretto/latest/corretto-25-ug/downloads-list.html
# - Eclipse Temurin: https://adoptium.net/temurin/releases/?version=25

# Or use Docker
docker build --target builder -t test-image .
```

#### 2. Port Already in Use

**Problem**: `Address already in use` error

**Solution**:
```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>

# Or use different port
# Edit docker-compose.yml or application.yml
```

#### 3. Out of Memory

**Problem**: `java.lang.OutOfMemoryError: Java heap space`

**Solution**:
```bash
# Increase heap size for tests
export MAVEN_OPTS="-Xmx2g"
mvn test

# Or edit pom.xml
<configuration>
  <argLine>-Xmx2g</argLine>
</configuration>
```

#### 4. Test Timeout

**Problem**: Tests hang or timeout

**Solution**:
```bash
# Increase timeout in test
@Test
@Timeout(value = 30, unit = TimeUnit.SECONDS)
public void testEndpoint() { ... }

# For Go tests
go test -timeout 30s ./...
```

#### 5. Connection Refused

**Problem**: `Connection refused` during integration tests

**Solution**:
```bash
# Check if services are running
docker compose ps

# Check service health
curl http://localhost:8080/actuator/health

# Wait longer for startup
sleep 60

# Check logs for errors
docker compose logs quarkus-jvm
```

#### 6. Metric Not Found

**Problem**: Custom metric `hello_request_count_total` not found

**Solution**:
```bash
# Send requests to generate metrics
curl http://localhost:8080/hello/platform

# Wait for metric export (15 seconds default)
sleep 15

# Check metrics endpoint
curl http://localhost:8080/actuator/prometheus | grep hello

# For Quarkus
curl http://localhost:8086/q/metrics | grep hello
```

#### 7. Trace Not Appearing

**Problem**: Traces not visible in Grafana Tempo

**Solution**:
```bash
# Check Alloy is running
docker compose ps alloy

# Check Tempo is running
docker compose ps tempo

# Send requests to generate traces
for i in {1..50}; do curl http://localhost:8080/hello/platform; done

# Wait for trace export (5-10 seconds)
sleep 10

# Check Alloy logs
docker compose logs alloy | grep trace

# Check Tempo logs
docker compose logs tempo
```

### Test Debugging

#### Enable Verbose Output

**Java Tests**:
```bash
# Maven verbose
mvn test -X

# Show test output
mvn test -Dsurefire.printSummary=true -Dsurefire.useFile=false
```

**Go Tests**:
```bash
# Verbose output
go test -v ./...

# Show test output even for passing tests
go test -v ./... -args -test.v
```

**Integration Tests**:
```bash
# Enable verbose mode
export VERBOSE=true
./run-integration-tests.sh

# Run with bash debug
bash -x ./run-integration-tests.sh
```

#### Inspect Test Reports

**Java (Surefire Reports)**:
```bash
# View test reports
cat services/quarkus/jvm/target/surefire-reports/*.txt

# Open HTML report
open services/quarkus/jvm/target/surefire-reports/index.html
```

**Go (Test Output)**:
```bash
# Save test output
go test ./... -v > test-output.txt

# Run with race detector
go test -race ./...

# Run with coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Best Practices

### Unit Testing

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Fast**: Unit tests should run quickly (< 5 seconds total)
3. **Deterministic**: Tests should produce consistent results
4. **Clear Names**: Test names should describe what they test
5. **Single Assertion**: Prefer one logical assertion per test

### Integration Testing

1. **Realistic Environment**: Test in conditions similar to production
2. **Cleanup**: Always clean up resources after tests
3. **Timeouts**: Set appropriate timeouts for external dependencies
4. **Retries**: Implement retry logic for flaky network tests
5. **Logging**: Log detailed information for debugging failures

### Test Maintenance

1. **Keep Updated**: Update tests when code changes
2. **Remove Dead Code**: Delete unused or obsolete tests
3. **Refactor**: Keep tests DRY (Don't Repeat Yourself)
4. **Document**: Add comments for complex test logic
5. **Review**: Include tests in code reviews

### Performance

1. **Warmup**: Allow services to warm up before benchmarking
2. **Consistent Load**: Use wrk2 for deterministic load testing
3. **Monitor**: Check metrics during performance tests
4. **Baseline**: Establish performance baselines
5. **Trends**: Track performance over time

### CI/CD

1. **Fast Feedback**: Run unit tests first, integration tests later
2. **Parallel**: Run independent tests in parallel
3. **Caching**: Cache dependencies (Maven, Go modules)
4. **Artifacts**: Save test reports and logs
5. **Notifications**: Alert on test failures

## Additional Resources

### Documentation
- [Project Structure](STRUCTURE.md)
- [Security Guidelines](SECURITY.md)
- [Code Quality Standards](LINTING_AND_CODE_QUALITY.md)
- [Integration Tests README](../integration-tests/README.md)

### Framework Docs
- [Quarkus Testing](https://quarkus.io/guides/getting-started-testing)
- [Spring Boot Testing](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing)
- [Go Testing](https://go.dev/doc/tutorial/add-a-test)
- [OpenTelemetry Java](https://opentelemetry.io/docs/instrumentation/java/)
- [OpenTelemetry Go](https://opentelemetry.io/docs/instrumentation/go/)

### Tools
- [RestAssured Documentation](https://rest-assured.io/)
- [MockMvc Reference](https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html)
- [WebTestClient Guide](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)
- [Fiber Testing](https://docs.gofiber.io/api/app#test)
- [wrk2 Load Testing](https://github.com/giltene/wrk2)

---

**Last Updated**: December 2025  
**Version**: 1.0.0  
**Maintained by**: Observability-Benchmarking Team
