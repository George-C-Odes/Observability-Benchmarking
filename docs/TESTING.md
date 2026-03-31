<!-- Generated from `docs/TESTING.template.md` via `scripts/render-readmes.mjs`. Do not edit `docs/TESTING.md` directly. -->

# Comprehensive Testing Guide

> Complete guide to unit tests, integration tests, and observability validation for the Observability Benchmarking project.

## Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Unit Tests](#unit-tests)
  - [Java Services](#java-services)
  - [Go Service](#go-service)
  - [Python Service (Django)](#python-service-django)
- [Integration Tests](#integration-tests)
- [Observability Testing](#observability-testing)
- [Performance Testing](#performance-testing)
- [Code Coverage](#code-coverage)
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

| Component      | Unit Tests    | Integration Tests  | Observability Tests |
|----------------|---------------|--------------------|---------------------|
| Quarkus JVM    | ✅ 18 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Spring Tomcat  | ✅ 30 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Spring Netty   | ✅ 16 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Micronaut JVM  | ✅ 5 tests     | ✅ Covered          | ✅ Metrics/Traces    |
| Helidon SE JVM | ✅ 6 tests     | ✅ Covered          | ✅ Metrics/Traces    |
| Helidon MP JVM | ✅ 6 tests     | ✅ Covered          | ✅ Metrics/Traces    |
| Spark JVM      | ✅ 20 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Javalin JVM    | ✅ 19 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Dropwizard JVM | ✅ 17 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Vert.x JVM     | ✅ 14 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| Pekko JVM      | ✅ 3 tests     | ✅ Covered          | ✅ Metrics/Traces    |
| Go Fiber       | ✅ 7 tests     | ✅ Covered          | ✅ Metrics/Traces    |
| Django (Py)    | ✅ 39 tests    | ✅ Covered          | ✅ Metrics/Traces    |
| **Total**      | **200 tests** | **100+ scenarios** | **Full stack**      |

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

**Java (Micronaut)**
- Testing Framework: JUnit 5
- HTTP Testing: Micronaut `@MicronautTest` + HTTP Client
- Test Context: `@MicronautTest`
- Metrics: Micrometer (OpenTelemetry)

**Java (Helidon SE)**
- Testing Framework: JUnit 5
- HTTP Testing: Helidon WebClient / direct HTTP
- Metrics: Micrometer (OpenTelemetry)

**Java (Helidon MP)**
- Testing Framework: JUnit 5
- HTTP Testing: JAX-RS Client
- Metrics: Micrometer (OpenTelemetry)

**Java (Spark)**
- Testing Framework: JUnit 5
- HTTP Testing: Direct HTTP and unit tests
- Metrics: Micrometer (OpenTelemetry Java Agent)

**Java (Javalin)**
- Testing Framework: JUnit 5
- HTTP Testing: Direct HTTP and unit tests
- Metrics: Micrometer (OpenTelemetry Java Agent)

**Java (Dropwizard)**
- Testing Framework: JUnit 5
- HTTP Testing: JAX-RS resource testing
- Metrics: Micrometer (OpenTelemetry Java Agent)

**Java (Vert.x)**
- Testing Framework: JUnit 5
- HTTP Testing: Vert.x test utilities
- Metrics: Micrometer (OpenTelemetry)

**Java (Pekko)**
- Testing Framework: JUnit 5
- HTTP Testing: Pekko HTTP testkit
- Metrics: Micrometer (OpenTelemetry Java Agent)

**Go**
- Testing Framework: Go testing package
- HTTP Testing: httptest + Fiber Test
- Observability: OpenTelemetry Go SDK

**Python (Django)**
- Testing Framework: Django test runner (unittest-based)
- HTTP Testing: Django `RequestFactory` + `Client`
- Observability: OpenTelemetry Python SDK
- Tests located in: `services/python/django/gunicorn/common/src/obbench_django_common/tests/`

**Integration**
- Tool: Bash script (`run-integration-tests.sh`)
- HTTP Client: curl
- Exit Codes: Standard (0=success, 1=failure)
- Output: Colored terminal output with detailed reporting

## Unit Tests

### Java Services

#### Version Requirements

```
Java: 25 (Amazon Corretto 25.0.2 or Eclipse Temurin 25.0.2)
Maven: 3.9+
Spring Boot: 4.0.5 (3.5.13 also supported)
Quarkus: 3.34.1
```

> **Important**: Java 25 is required. If you have a different version, use Docker builds (see below).

#### Test Structure

All Java unit tests follow a consistent pattern:

```
services/java/
├── quarkus/jvm/src/test/java/
│   └── HelloResourceTest.java, HelloResourceObservabilityTest.java
├── spring/jvm/tomcat/src/test/java/
│   └── HelloPlatformControllerTest.java, HelloPlatformControllerObservabilityTest.java,
│       HelloVirtualControllerTest.java, HelloVirtualControllerObservabilityTest.java
├── spring/jvm/netty/src/test/java/
│   └── HelloReactiveControllerTest.java, HelloReactiveControllerObservabilityTest.java
├── micronaut/jvm/src/test/java/
│   └── HelloControllerTest.java, MetricsWiringTest.java
├── helidon/se/jvm/src/test/java/
│   └── HelloRoutingTest.java, HelloServiceTest.java
├── helidon/mp/jvm/src/test/java/
│   └── HelloResourceTest.java, HelloServiceTest.java
├── spark/jvm/src/test/java/
│   └── HelloRoutesTest.java, HelloServiceTest.java, CacheProviderTest.java,
│       MetricsProviderTest.java, ServiceConfigTest.java
├── javalin/jvm/src/test/java/
│   └── HelloRoutesTest.java, HelloServiceTest.java, CacheProviderTest.java,
│       MetricsProviderTest.java, ServiceConfigTest.java
├── dropwizard/jvm/src/test/java/
│   └── HelloResourceTest.java, HelloServiceTest.java, CacheProviderTest.java,
│       MetricsProviderTest.java, ServiceConfigTest.java
├── vertx/jvm/src/test/java/
│   └── HelloModeTest.java, HelloServiceTest.java, CacheProviderTest.java,
│       MetricsProviderTest.java, ServiceConfigTest.java
└── pekko/jvm/src/test/java/
    └── HelloServiceTest.java
```

#### Running Quarkus Tests

```bash
cd services/java/quarkus/jvm
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
cd services/java/spring/jvm/tomcat
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
- Spring Boot 4.0.5 with OpenTelemetry Java Agent
- Micrometer metrics integration
- Platform vs. Virtual thread behavior
- POM refactoring (no parent dependency)

#### Running Spring Boot Netty Tests

```bash
cd services/java/spring/jvm/netty
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
cd services/java/quarkus/jvm && mvn test && cd -
cd services/java/spring/jvm/tomcat && mvn test && cd -
cd services/java/spring/jvm/netty && mvn test && cd -
cd services/java/micronaut/jvm && mvn test && cd -
cd services/java/helidon/se/jvm && mvn test && cd -
cd services/java/helidon/mp/jvm && mvn test && cd -
cd services/java/spark/jvm && mvn test && cd -
cd services/java/javalin/jvm && mvn test && cd -
cd services/java/dropwizard/jvm && mvn test && cd -
cd services/java/vertx/jvm && mvn test && cd -
cd services/java/pekko/jvm && mvn test && cd -
```

#### Docker-Based Testing (Recommended)

Build and test with Docker to ensure the correct Java version. Docker builds run tests automatically as part of the Maven build process.

> **See [services/README.md](../services/README.md)** for the full list of Docker build commands for all services (JVM and Native).

### Go Service

#### Version Requirements

```
Go: 1.26.1+
Fiber: v3.1.0
OpenTelemetry: Latest stable
```

#### Test Structure

```
services/go/enhanced/internal/handlers/hello_test.go
services/go/enhanced/internal/cache/cache_test.go
```

#### Running Go Tests

```bash
cd services/go/enhanced

# Download dependencies (first time only)
go mod download

# Run all tests with verbose output
go test ./... -v

# Run tests with coverage summary
go test ./... -cover

# Run a focused handler test
# (the enhanced service exercises the /hello/virtual endpoint)
go test ./... -run TestVirtual_Defaults -v
```

**Test Coverage**:
- ✅ HTTP endpoint (`/hello/virtual`)
- ✅ Query parameters (`sleep`, `log`) including bad-parameter validation (400)
- ✅ Cache implementations and basic hit/miss behavior
- ✅ OpenTelemetry wiring (uses noop providers in unit tests for determinism)
- ✅ Fiber framework integration

**Example Test Output**:
```
=== RUN   TestVirtual_Defaults
--- PASS: TestVirtual_Defaults (0.00s)
=== RUN   TestVirtual_LogEnabled
--- PASS: TestVirtual_LogEnabled (0.00s)
=== RUN   TestVirtual_Sleep
--- PASS: TestVirtual_Sleep (1.00s)
=== RUN   TestVirtual_BadParams
--- PASS: TestVirtual_BadParams (0.00s)
PASS
ok      hello/internal/handlers  1.0s
```

**Key Features Tested**:
- Fiber web framework routing and request testing via `httptest`
- OpenTelemetry SDK usage (but unit tests use noop providers)
- Custom metric counter (`hello.request.count`) (exported via observable counter)
- Cache behavior across different implementations

**Note**: The Go module name is `hello` (see `services/go/enhanced/go.mod`), so `go test` output uses `hello/...` package paths.

### Python Service (Django)

#### Version Requirements

```
Python: 3.13+
Django: 6.0+
OpenTelemetry: Latest stable
```

#### Test Structure

```
services/python/django/gunicorn/common/src/obbench_django_common/tests/
├── test_views.py           # 6 tests  - endpoint behavior
├── test_hello_service.py   # 2 tests  - service logic
├── test_cache_factory.py   # 3 tests  - cache initialization
├── test_boot.py            # 3 tests  - bootstrap delegation and error flow
├── test_otel_setup.py      # 18 tests - OTel lifecycle + suppression logic
├── test_otel_metrics.py    # 2 tests  - metrics registration + retry behavior
├── test_pyroscope_setup.py # 4 tests  - profiling setup + failure handling
└── test_log_formatter.py   # 1 test   - log format validation
```

#### Running Django Tests

Tests use Django's built-in test runner (`unittest`-based). They require a
Django `manage.py` entry-point, so run from either the **WSGI** or **ASGI**
module directory (both share the same common test suite):

```bash
# From the repository root — run all common tests via the WSGI module
cd services/python/django/gunicorn/WSGI
OTEL_SDK_DISABLED=true python manage.py test obbench_django_common.tests --verbosity=2
cd -

# Or via the ASGI module
cd services/python/django/gunicorn/ASGI
OTEL_SDK_DISABLED=true python manage.py test obbench_django_common.tests --verbosity=2
cd -
```

> **Note:** `OTEL_SDK_DISABLED=true` prevents the OpenTelemetry SDK from
> attempting to connect to a collector during tests.  This is the same
> command the Dockerfiles execute at build time.

#### Matching the Django CI workflow locally

The Django quality workflow in `.github/workflows/django_python_quality.yml`
does more than execute tests:

1. Runs syntax checks, prints the Ruff version for visibility, then runs Ruff lint and format checks for the shared `common` package.
2. Installs the shared package into each runtime module environment.
3. Prints the Ruff version, runs module syntax checks, Ruff lint and format checks, `python manage.py check`, and the shared test suite.

The workflow also sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` so `actions/setup-python@v6.2.0` is exercised on Node 24 ahead of GitHub's runtime migration.

Use the following sequence when you want to reproduce the CI gates locally:

```bash
# Shared package checks
cd services/python/django/gunicorn/common
python -m compileall src
python -m ruff --version
python -m ruff check .
python -m ruff format --check .

# WSGI module checks
cd ../WSGI
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff --version
python -m ruff check .
python -m ruff format --check .
python manage.py check
OTEL_SDK_DISABLED=true python manage.py test obbench_django_common.tests --verbosity=2

# ASGI module checks
cd ../ASGI
python -m pip install ../common -r requirements.txt -r requirements-dev.txt
python -m compileall manage.py hello_project gunicorn.conf.py
python -m ruff --version
python -m ruff check .
python -m ruff format --check .
python manage.py check
OTEL_SDK_DISABLED=true python manage.py test obbench_django_common.tests --verbosity=2
```

`services/python/django/README.md` includes PowerShell-friendly equivalents for
the same flow.

**Test Coverage**:
- ✅ HTTP endpoints (`/hello/platform`, `/hello/reactive`)
- ✅ Service logic and response format
- ✅ Cache factory initialization
- ✅ Bootstrap wiring and observability delegation
- ✅ OpenTelemetry SDK setup, shutdown, and suppression logic
- ✅ OpenTelemetry metric registration and retry behavior
- ✅ Pyroscope profiling setup and failure handling
- ✅ Log formatting
- ✅ OpenTelemetry wiring and test-safe disable path

**Key Features Tested**:
- Django request/response lifecycle
- WSGI (platform) and ASGI (reactive) modes
- Startup / post-fork observability initialization behavior
- OpenTelemetry Python SDK integration and guarded optional setup
- Custom metric counter registration, retry, and cache behavior

### Next.js Dashboard

#### Version Requirements

```
Node.js: 22.12+
Next.js: 16.2.1
React: 19.2.4
TypeScript: 5.9.3
Vitest: 4.x
```

#### Test Structure

The dashboard uses a dual-environment Vitest configuration:

| Config File             | Environment | Tests Covered                                         |
|-------------------------|-------------|-------------------------------------------------------|
| `vitest.config.node.ts` | `node`      | `lib/**/*.test.{ts,tsx}`, `app/api/**/*.test.*`       |
| `vitest.config.dom.ts`  | `jsdom`     | `app/components/**/*.test.*`, `app/hooks/**/*.test.*` |

The split keeps Node-only tests fast (no jsdom overhead) while React component and hook tests get a proper DOM environment via jsdom and React Testing Library.

#### Running Dashboard Tests

```bash
cd utils/nextjs-dash
npm install

# Run all tests (node + dom)
npm test

# Run only node-environment tests (API routes, lib utilities)
npm run test:node

# Run only DOM-environment tests (React components, hooks)
npm run test:dom

# Watch mode (DOM tests)
npm run test:watch

# With coverage
npm run test:coverage
```

#### Full Quality Gate (matching CI)

The CI workflow (`.github/workflows/nextjs_dash_quality.yml`) runs the full quality gate sequence:

```bash
npm run lint          # ESLint --max-warnings=0
npm run typecheck     # tsc --noEmit (strict mode)
npm run test:node     # Vitest node environment
npm run test:dom      # Vitest jsdom environment
npm run build         # Next.js production build smoke test
```

Quick one-liner:

```bash
npm -s run lint ; npm -s run typecheck ; npm -s test ; npm -s run build
```

**Test Coverage**:
- ✅ API route handlers (proxy logic, health endpoints)
- ✅ Library utilities and runtime config types
- ✅ React hooks (runtime config, job runner, SSE orchestrator restart simulation)
- ✅ React components (service health, script runner, logs UI, benchmark targets)

**Key Features Tested**:
- Next.js API route proxy behavior
- React Testing Library + jsdom for component tests
- Hook lifecycle (useRuntimeConfig factory, useJobRunner)
- SSE stream error handling and orchestrator restart simulation
- Material-UI component integration

## Integration Tests

Integration tests validate the entire deployment stack, including Docker containers, networking, and observability components.

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
   - 8080-8101: Java Service ports
   - 9080-9081: Go Service ports
   - 9090-9091: Django (Python) Service ports
   - 3000: Grafana
   - 3001: NextJS Dash
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

**Wait Time**: Allow 30–60 seconds for all services to initialize.

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

# Micronaut Services
export MICRONAUT_JVM_URL=http://localhost:8088
export MICRONAUT_NATIVE_URL=http://localhost:8089

# Helidon SE Services
export HELIDON_SE_JVM_URL=http://localhost:8090
export HELIDON_SE_NATIVE_URL=http://localhost:8091

# Helidon MP Services
export HELIDON_MP_JVM_URL=http://localhost:8092
export HELIDON_MP_NATIVE_URL=http://localhost:8093

# Spark Services
export SPARK_JVM_PLATFORM_URL=http://localhost:8094
export SPARK_JVM_VIRTUAL_URL=http://localhost:8095

# Javalin Services
export JAVALIN_JVM_PLATFORM_URL=http://localhost:8096
export JAVALIN_JVM_VIRTUAL_URL=http://localhost:8097

# Dropwizard Services
export DROPWIZARD_JVM_PLATFORM_URL=http://localhost:8098
export DROPWIZARD_JVM_VIRTUAL_URL=http://localhost:8099

# Vert.x Services
export VERTX_JVM_URL=http://localhost:8100

# Pekko Services
export PEKKO_JVM_URL=http://localhost:8101

# Go Service
export GO_URL=http://localhost:9080

# Django Services
export DJANGO_PLATFORM_URL=http://localhost:9090
export DJANGO_REACTIVE_URL=http://localhost:9091

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

#### Deployment Verification

| Test                   | Endpoint          | Validation                |
|------------------------|-------------------|---------------------------|
| Quarkus Platform       | `/hello/platform` | Status 200, JSON, content |
| Quarkus Virtual        | `/hello/virtual`  | Status 200, JSON, content |
| Quarkus Reactive       | `/hello/reactive` | Status 200, JSON, content |
| Spring Tomcat Platform | `/hello/platform` | Status 200, JSON, content |
| Spring Tomcat Virtual  | `/hello/virtual`  | Status 200, JSON, content |
| Spring Netty Reactive  | `/hello/reactive` | Status 200, JSON, content |
| Micronaut Platform     | `/hello/platform` | Status 200, JSON, content |
| Micronaut Virtual      | `/hello/virtual`  | Status 200, JSON, content |
| Micronaut Reactive     | `/hello/reactive` | Status 200, JSON, content |
| Helidon SE Virtual     | `/hello/virtual`  | Status 200, JSON, content |
| Helidon MP Virtual     | `/hello/virtual`  | Status 200, JSON, content |
| Spark Platform         | `/hello/platform` | Status 200, JSON, content |
| Spark Virtual          | `/hello/virtual`  | Status 200, JSON, content |
| Javalin Platform       | `/hello/platform` | Status 200, JSON, content |
| Javalin Virtual        | `/hello/virtual`  | Status 200, JSON, content |
| Dropwizard Platform    | `/hello/platform` | Status 200, JSON, content |
| Dropwizard Virtual     | `/hello/virtual`  | Status 200, JSON, content |
| Vert.x Reactive        | `/hello/reactive` | Status 200, JSON, content |
| Pekko Reactive         | `/hello/reactive` | Status 200, JSON, content |
| Go Virtual             | `/hello/virtual`  | Status 200, content       |
| Django Platform        | `/hello/platform` | Status 200, JSON, content |
| Django Reactive        | `/hello/reactive` | Status 200, JSON, content |

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
Run Environment
==========================================
Host OS: Linux <HOST> 6.6.114.1-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Mon Dec  1 20:46:23 UTC 2025 x86_64 x86_64 x86_64 GNU/Linux
Terminal / session:
  stdin:   TTY
  stdout:  not a TTY
  stderr:  not a TTY
  TERM:    xterm-256color
  SHELL:   /bin/bash
  argv0:   run-integration-tests.sh
  USER:    <USER>
  LOGNAME: <USER>
  WSL:     Ubuntu
Timestamp (host): 2026-03-07T22:37:15+02:00
==========================================

==========================================
Integration Test Suite
==========================================

Testing Framework Versions:
- Spring Boot: 4.0.5
- Quarkus: 3.34.1
- Micronaut: 4.10.18
- Helidon: 4.3.4
- Spark: 3.0.4
- Javalin: 7.1.0
- Dropwizard: 5.0.1
- Vert.x: 5.0.8
- Pekko: 1.3.0
- Go: 1.26.1
- Django: 6.0.3

==========================================
JVM Services - Deployment Tests
==========================================

--- Spring Boot JVM Tomcat Platform (port 8080) ---
Testing Spring Tomcat Platform - /hello/platform... ✓ PASSED

--- Spring Boot JVM Tomcat Virtual (port 8081) ---
Testing Spring Tomcat Virtual - /hello/virtual... ✓ PASSED

--- Spring Boot JVM Netty (port 8082) ---
Testing Spring Netty - /hello/reactive... ✓ PASSED

--- Quarkus JVM (port 8086) ---
Testing Quarkus JVM - /hello/platform... ✓ PASSED
Testing Quarkus JVM - /hello/virtual... ✓ PASSED
Testing Quarkus JVM - /hello/reactive... ✓ PASSED

--- Micronaut JVM (port 8088) ---
Testing Micronaut JVM - /hello/platform... ✓ PASSED
Testing Micronaut JVM - /hello/virtual... ✓ PASSED
Testing Micronaut JVM - /hello/reactive... ✓ PASSED
Testing Micronaut JVM - /health... ✓ PASSED

--- Helidon SE JVM (port 8090) ---
Testing Helidon SE JVM - /hello/virtual... ✓ PASSED
Testing Helidon SE JVM - /observe/health... ✓ PASSED

--- Helidon MP JVM (port 8092) ---
Testing Helidon MP JVM - /hello/virtual... ✓ PASSED
Testing Helidon MP JVM - /health... ✓ PASSED

--- Spark JVM Platform (port 8094) ---
Testing Spark JVM Platform - /hello/platform... ✓ PASSED
Testing Spark JVM Platform Ready... ✓ PASSED

--- Spark JVM Virtual (port 8095) ---
Testing Spark JVM Virtual - /hello/virtual... ✓ PASSED
Testing Spark JVM Virtual Ready... ✓ PASSED

--- Javalin JVM Platform (port 8096) ---
Testing Javalin JVM Platform - /hello/platform... ✓ PASSED
Testing Javalin JVM Platform Ready... ✓ PASSED

--- Javalin JVM Virtual (port 8097) ---
Testing Javalin JVM Virtual - /hello/virtual... ✓ PASSED
Testing Javalin JVM Virtual Ready... ✓ PASSED

--- Dropwizard JVM Platform (port 8098) ---
Testing Dropwizard JVM Platform - /hello/platform... ✓ PASSED
Testing Dropwizard JVM Platform Ready... ✓ PASSED

--- Dropwizard JVM Virtual (port 8099) ---
Testing Dropwizard JVM Virtual - /hello/virtual... ✓ PASSED
Testing Dropwizard JVM Virtual Ready... ✓ PASSED

--- Vert.x JVM (port 8100) ---
Testing Vert.x JVM - /hello/reactive... ✓ PASSED
Testing Vert.x JVM Ready... ✓ PASSED

--- Pekko JVM (port 8101) ---
Testing Pekko JVM - /hello/reactive... ✓ PASSED
Testing Pekko JVM Ready... ✓ PASSED

==========================================
Native Services - Deployment Tests
==========================================

--- Spring Boot Native Tomcat Platform (port 8083) ---
Testing Spring Native Tomcat Platform - /hello/platform... ✓ PASSED

--- Spring Boot Native Tomcat Virtual (port 8084) ---
Testing Spring Native Tomcat Virtual - /hello/virtual... ✓ PASSED

--- Spring Boot Native Netty (port 8085) ---
Testing Spring Native Netty - /hello/reactive... ✓ PASSED

--- Quarkus Native (port 8087) ---
Testing Quarkus Native - /hello/platform... ✓ PASSED
Testing Quarkus Native - /hello/virtual... ✓ PASSED
Testing Quarkus Native - /hello/reactive... ✓ PASSED

--- Micronaut Native (port 8089) ---
Testing Micronaut Native - /hello/platform... ✓ PASSED
Testing Micronaut Native - /hello/virtual... ✓ PASSED
Testing Micronaut Native - /hello/reactive... ✓ PASSED
Testing Micronaut Native - /health... ✓ PASSED

--- Helidon SE Native (port 8091) ---
Testing Helidon SE Native - /hello/virtual... ✓ PASSED
Testing Helidon SE Native - /observe/health... ✓ PASSED

--- Helidon MP Native (port 8093) ---
Testing Helidon MP Native - /hello/virtual... ✓ PASSED
Testing Helidon MP Native - /health... ✓ PASSED

==========================================
Go Service - Deployment Tests
==========================================

--- Go Fiber (port 9080) ---
Testing Go - /hello/virtual... ✓ PASSED

==========================================
Python Services - Deployment Tests
==========================================

--- Django Platform (port 9090) ---
Testing Django - /hello/platform... ✓ PASSED

--- Django Reactive (port 9091) ---
Testing Django - /hello/reactive... ✓ PASSED

==========================================
Observability Mechanism Tests
==========================================

--- Metrics Collection ---
Testing Spring Tomcat Platform Metrics... ✓ PASSED
Testing Spring Tomcat Virtual Metrics... ✓ PASSED
Testing Spring Netty Metrics... ✓ PASSED
Testing Spring Native Tomcat Platform Metrics... ✓ PASSED
Testing Spring Native Tomcat Virtual Metrics... ✓ PASSED
Testing Spring Native Netty Metrics... ✓ PASSED
Testing Quarkus JVM Metrics... ✓ PASSED
Testing Quarkus Native Metrics... ✓ PASSED
Testing Micronaut JVM Metrics... ✓ PASSED
Testing Micronaut Native Metrics... ✓ PASSED
Testing Helidon SE JVM Ready... ✓ PASSED
Testing Helidon SE Native Ready... ✓ PASSED
Testing Helidon MP JVM Ready... ✓ PASSED
Testing Helidon MP Native Ready... ✓ PASSED
Testing Spark JVM Platform Ready... ✓ PASSED
Testing Spark JVM Virtual Ready... ✓ PASSED
Testing Javalin JVM Platform Ready... ✓ PASSED
Testing Javalin JVM Virtual Ready... ✓ PASSED
Testing Dropwizard JVM Platform Ready... ✓ PASSED
Testing Dropwizard JVM Virtual Ready... ✓ PASSED
Testing Vert.x JVM Ready... ✓ PASSED
Testing Pekko JVM Ready... ✓ PASSED
Testing Go Metrics... ✓ PASSED
Testing Django Platform health... ✓ PASSED
Testing Django Reactive health... ✓ PASSED

--- Grafana Stack Readiness ---
Testing Grafana UI... ✓ PASSED
Testing Alloy... ✓ PASSED
Testing Loki... ✓ PASSED
Testing Mimir... ✓ PASSED
Testing Tempo... ✓ PASSED
Testing Pyroscope... ✓ PASSED

--- Orchestration Stack Readiness ---
Testing NextJS UI... ✓ PASSED
Testing Orchestrator... ✓ PASSED
Testing Orchestrator Aggregated... ✓ PASSED

--- wrk2 Readiness + On-demand Exec ---
Waiting for wrk2 (/ready) to be ready... ✓ READY
wrk2 exec self-ready check (printing wrk output below):
----- wrk2 exec output (begin) -----
Running 1s test @ http://0.0.0.0:3003/ready
  1 threads and 1 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency   458.00us    0.00us 458.00us  100.00%
    Req/Sec       -nan      -nan   0.00      0.00%
  2 requests in 1.00s, 370.00B read
Requests/sec:      2.00
Transfer/sec:     369.25B
----- wrk2 exec output (end) -----
✓ PASSED

--- Trace Generation (Smoke Test) ---
Generating request to create trace and verify container log output...
Trace log check Spring JVM Tomcat Platform (spring-jvm-tomcat-platform)... ✓ PASSED (found 'http-nio')
Trace log check Spring JVM Tomcat Virtual (spring-jvm-tomcat-virtual)... ✓ PASSED (found 'VirtualThread')
Trace log check Spring JVM Netty Reactive (spring-jvm-netty)... ✓ PASSED (found 'reactor-http')
Trace log check Spring Native Tomcat Platform (spring-native-tomcat-platform)... ✓ PASSED (found 'http-nio')
Trace log check Spring Native Tomcat Virtual (spring-native-tomcat-virtual)... ✓ PASSED (found 'VirtualThread')
Trace log check Spring Native Netty Reactive (spring-native-netty)... ✓ PASSED (found 'reactor-http')
Trace log check Quarkus JVM Platform (quarkus-jvm)... ✓ PASSED (found 'executor-thread')
Trace log check Quarkus JVM Virtual (quarkus-jvm)... ✓ PASSED (found 'vthread')
Trace log check Quarkus JVM Reactive (quarkus-jvm)... ✓ PASSED (found 'vert.x-eventloop-thread')
Trace log check Quarkus Native Platform (quarkus-native)... ✓ PASSED (found 'executor-thread')
Trace log check Quarkus Native Virtual (quarkus-native)... ✓ PASSED (found 'vthread')
Trace log check Quarkus Native Reactive (quarkus-native)... ✓ PASSED (found 'vert.x-eventloop-thread')
Trace log check Micronaut JVM Platform (micronaut-jvm)... ✓ PASSED (found 'isVirtual: 'false'')
Trace log check Micronaut JVM Virtual (micronaut-jvm)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Micronaut JVM Reactive (micronaut-jvm)... ✓ PASSED (found 'EventLoopGroup')
Trace log check Micronaut Native Platform (micronaut-native)... ✓ PASSED (found 'isVirtual: 'false'')
Trace log check Micronaut Native Virtual (micronaut-native)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Micronaut Native Reactive (micronaut-native)... ✓ PASSED (found 'EventLoopGroup')
Trace log check Helidon SE JVM Virtual (helidon-se-jvm)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Helidon SE Native Virtual (helidon-se-native)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Helidon MP JVM Virtual (helidon-mp-jvm)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Helidon MP Native Virtual (helidon-mp-native)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Spark JVM Platform (spark-jvm-platform)... ✓ PASSED (found 'isVirtual: 'false'')
Trace log check Spark JVM Virtual (spark-jvm-virtual)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Javalin JVM Platform (javalin-jvm-platform)... ✓ PASSED (found 'isVirtual: 'false'')
Trace log check Javalin JVM Virtual (javalin-jvm-virtual)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Dropwizard JVM Platform (dropwizard-jvm-platform)... ✓ PASSED (found 'isVirtual: 'false'')
Trace log check Dropwizard JVM Virtual (dropwizard-jvm-virtual)... ✓ PASSED (found 'isVirtual: 'true'')
Trace log check Vert.x JVM Reactive (vertx-jvm)... ✓ PASSED (found 'vert.x-eventloop-thread')
Trace log check Pekko JVM Reactive (pekko-jvm)... ✓ PASSED (found 'pekko.actor.default-dispatcher')
Trace log check Go Virtual (go)... ✓ PASSED (found 'goroutine')
Trace log check Django Platform (django-platform)... ✓ PASSED (found 'ThreadPoolExecutor')
Trace log check Django Reactive (django-reactive)... ✓ PASSED (found 'MainThread')

==========================================
Test Summary
==========================================
Tests Passed: 109
Tests Failed: 0
==========================================

✅ All tests passed!

Next Steps:
1. Open Grafana: http://localhost:3000 (credentials: a/a)
2. Navigate to Drilldown
3. View Metrics [Mimir]
4. View Logs [Loki]
5. View Traces [Tempo]
6. View Profiles [Pyroscope]

[integration-tests] suite finished successfully
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
- Service name: `go`
- Instrumentation: OpenTelemetry Go SDK
- Span names: `hello-handler`

### Log Validation

#### Viewing Logs in Grafana

1. Open Grafana: http://localhost:3000
2. Go to Explore
3. Select a data source: Loki
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
2025-12-16T10:30:00.123Z Runtime version: go1.26.1 | Build version: go1.26.1
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

## Code Coverage

### Java — JaCoCo

All 12 Java/Maven JVM modules are instrumented with the
[JaCoCo Maven plugin](https://www.jacoco.org/jacoco/trunk/doc/maven.html)
(version 0.8.14). Coverage reports are generated automatically during the
Maven `verify` phase — no extra flags are needed.

#### Running locally

```bash
# From any Java module directory, e.g.:
cd services/java/vertx/jvm
mvn verify -Dcheckstyle.skip=true

# HTML report → target/site/jacoco/index.html
# XML report  → target/site/jacoco/jacoco.xml
```

#### How it works

1. **`prepare-agent`** (initialize phase) — JaCoCo injects a Java agent via
   the `@{argLine}` Maven property placeholder in each module's Surefire
   configuration.
2. **`report`** (verify phase) — JaCoCo reads the execution data
   (`target/jacoco.exec`) and produces HTML and XML reports under
   `target/site/jacoco/`.

#### CI workflow

The **Java Coverage** GitHub Actions workflow (`.github/workflows/java_coverage.yml`)
runs on every PR and push to `main` that touches `services/java/**` or
`utils/orchestrator/**`. It:

- Builds and tests each module in a matrix (12 parallel jobs).
- Parses the JaCoCo XML report and writes a coverage table to the
  **GitHub Step Summary**.
- Uploads the full HTML and XML report as an artifact named
  `coverage-java-{module}` (retained for 30 days).

#### Threshold strategy

Coverage thresholds are enforced via the `jacoco:check` Maven goal, bound to
the `verify` phase in all 12 modules. Current thresholds are uniform:

| Metric | Minimum |
|--------|--------:|
| Line   |     15% |
| Branch |     10% |

These conservative starting thresholds are intentionally set well below the
actual coverage of all modules to avoid false-positive build failures while the
baseline stabilizes. All 12 modules set `<haltOnFailure>false</haltOnFailure>` in
their `jacoco:check` configuration, so threshold violations are **logged as
warnings** but do **not** fail `mvn verify` — locally or in CI. The CI workflow's
Python parser evaluates thresholds independently and writes the result (✅ / ⚠️)
to the GitHub Step Summary. The job-level `continue-on-error: true` ensures that
even a test failure shows as yellow in the Checks UI without blocking merges.

| Stage       | Behaviour                                                             | Status  |
|-------------|-----------------------------------------------------------------------|---------|
| Report-only | Coverage numbers in Step Summary + artifacts; no failure              | Done    |
| Advisory    | `jacoco:check` with `haltOnFailure=false`; CI evaluates independently | Current |
| Hard gate   | Remove `haltOnFailure=false`; `jacoco:check` fails the build          | Future  |

**Tightening roadmap**: once baselines are collected from 2–3 CI runs, thresholds
will be raised per-module to ~5% below their observed coverage. Modules that
consistently exceed 50% line coverage will be promoted to hard gate first.

### Go & Python (planned)

Coverage tooling for Go (`go test -coverprofile`) and Python (`coverage.py`)
will be added in a later phase. See `plan-javaCoverage.prompt.md` for the
full roadmap.

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
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      
      - name: Set up Java 25
        uses: actions/setup-java@be666c2fcd27ec809703dec50e508c2fdc7f6654 # v5.2.0
        with:
          java-version: '25'
          distribution: 'corretto'
      
      - name: Test Quarkus JVM
        run: |
          cd services/java/quarkus/jvm
          mvn clean test
      
      - name: Test Spring Boot Tomcat
        run: |
          cd services/java/spring/jvm/tomcat
          mvn clean test
      
      - name: Test Spring Boot Netty
        run: |
          cd services/java/spring/jvm/netty
          mvn clean test
      
      - name: Upload Test Reports
        if: always()
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: java-test-reports
          path: '**/target/surefire-reports/**'

  unit-tests-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      
      - name: Set up Go 1.26.1
        uses: actions/setup-go@4a3601121dd01d1626a1e23e37211e3254c1c06c # v6.4.0
        with:
          go-version: '1.26.1'
      
      - name: Test Go Service
        run: |
          cd services/go/enhanced
          go mod download
          go test ./... -v -cover -coverprofile=coverage.out
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./services/go/enhanced/coverage.out
          flags: go-service

  integration-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests-java, unit-tests-go]
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      
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
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: integration-test-logs
          path: logs/

  docker-build-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service:
          - { name: quarkus-jvm, context: services, dockerfile: services/java/quarkus/jvm/Dockerfile, version: "3.34.1" }
          - { name: spring-jvm-tomcat, context: services, dockerfile: services/java/spring/jvm/Dockerfile, profile: tomcat, version: "4.0.5" }
          - { name: spring-jvm-netty, context: services, dockerfile: services/java/spring/jvm/Dockerfile, profile: netty, version: "4.0.5" }
          - { name: go, context: services/go/enhanced, dockerfile: services/go/enhanced/Dockerfile, version: "1.26.1" }
    
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      
      - name: Build ${{ matrix.service.name }}
        run: |
          # GitHub Actions: use matrix values + github.sha (not GitLab's $SERVICE / $CI_COMMIT_SHA).
          PROFILE_ARG=""
          if [ -n "${{ matrix.service.profile }}" ]; then
            PROFILE_ARG="--build-arg PROFILE=${{ matrix.service.profile }}"
          fi

          docker build \
            -t ${{ matrix.service.name }}:${{ github.sha }} \
            -f ${{ matrix.service.dockerfile }} \
            $PROFILE_ARG \
            ${{ matrix.service.context }}
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
    - cd services/java/quarkus/jvm
    - mvn clean test
  artifacts:
    reports:
      junit: services/java/quarkus/jvm/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:spring-jvm-tomcat:
  stage: test
  image: amazoncorretto:25
  script:
    - cd services/java/spring/jvm/tomcat
    - mvn clean test
  artifacts:
    reports:
      junit: services/java/spring/jvm/tomcat/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:spring-jvm-netty:
  stage: test
  image: amazoncorretto:25
  script:
    - cd services/java/spring/jvm/netty
    - mvn clean test
  artifacts:
    reports:
      junit: services/java/spring/jvm/netty/target/surefire-reports/TEST-*.xml
    expire_in: 1 week

test:go:
  stage: test
  image: golang:1.26.1
  script:
    - cd services/go/enhanced
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
      - SERVICE: [quarkus-jvm, spring-jvm-tomcat, spring-jvm-netty, go]
  script:
    # NOTE: Use explicit Dockerfile paths/contexts to match the repo layout.
    - |
      if [ "$SERVICE" = "quarkus-jvm" ]; then
        docker build -t quarkus-jvm:$CI_COMMIT_SHA -f services/java/quarkus/jvm/Dockerfile services
      elif [ "$SERVICE" = "spring-jvm-tomcat" ]; then
        docker build -t spring-jvm-tomcat:$CI_COMMIT_SHA -f services/java/spring/jvm/Dockerfile --build-arg PROFILE=tomcat services
      elif [ "$SERVICE" = "spring-jvm-netty" ]; then
        docker build -t spring-jvm-netty:$CI_COMMIT_SHA -f services/java/spring/jvm/Dockerfile --build-arg PROFILE=netty services
      elif [ "$SERVICE" = "go" ]; then
        docker build -t go:$CI_COMMIT_SHA -f services/go/enhanced/Dockerfile services/go/enhanced
      else
        echo "Unknown SERVICE=$SERVICE"; exit 1
      fi
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
cat services/java/quarkus/jvm/target/surefire-reports/*.txt

# Open HTML report
open services/java/quarkus/jvm/target/surefire-reports/index.html
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
- [Services & Docker Builds](../services/README.md)
- [Security Guidelines](SECURITY.md)
- [Code Quality Standards](LINTING_AND_CODE_QUALITY.md)
- [Integration Tests README](../integration-tests/README.md)

### Framework Docs
- [Quarkus Testing](https://quarkus.io/guides/getting-started-testing)
- [Spring Boot Testing](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing)
- [Micronaut Testing](https://docs.micronaut.io/latest/guide/#testing)
- [Helidon Testing](https://helidon.io/docs/v4/testing)
- [Spark Java](https://sparkjava.com/documentation)
- [Javalin Testing](https://javalin.io/documentation)
- [Dropwizard Testing](https://www.dropwizard.io/en/stable/manual/testing.html)
- [Vert.x Testing](https://vertx.io/docs/vertx-junit5/java/)
- [Pekko HTTP](https://pekko.apache.org/docs/pekko-http/current/)
- [Go Testing](https://go.dev/doc/tutorial/add-a-test)
- [Django Testing](https://docs.djangoproject.com/en/5.2/topics/testing/)
- [OpenTelemetry Java](https://opentelemetry.io/docs/instrumentation/java/)
- [OpenTelemetry Go](https://opentelemetry.io/docs/instrumentation/go/)
- [OpenTelemetry Python](https://opentelemetry.io/docs/instrumentation/python/)

### Tools
- [RestAssured Documentation](https://rest-assured.io/)
- [MockMvc Reference](https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html)
- [WebTestClient Guide](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)
- [Fiber Testing](https://docs.gofiber.io/api/app#test)
- [wrk2 Load Testing](https://github.com/giltene/wrk2)

---

**Last Updated**: March 2026  
**Version**: 2.0.0  
**Maintained by**: Observability-Benchmarking Team
