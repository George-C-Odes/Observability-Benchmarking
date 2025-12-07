# Testing Guide

This document describes the testing strategy and how to run tests for the Observability Benchmarking project.

## Overview

The project includes two types of tests:
1. **Unit Tests**: Test individual REST endpoints and service logic
2. **Integration Tests**: Verify deployment setup and observability mechanisms

## Unit Tests

### Java Services (Quarkus & Spring Boot)

Unit tests for Java services are located in `src/test/java` directories within each service module.

#### Requirements

- Java 25 (Amazon Corretto or Eclipse Temurin)
- Maven 3.9+

**Note**: The project is configured to use Java 25. If you have a different Java version installed, the easiest way to run tests is through Docker (see Docker Build section below).

#### Running Tests

##### Quarkus JVM Service

```bash
cd services/quarkus/jvm
mvn test
```

The Quarkus tests use RestAssured and test:
- `/hello/platform` - Platform thread endpoint
- `/hello/virtual` - Virtual thread endpoint  
- `/hello/reactive` - Reactive endpoint
- Query parameters: `sleep` and `log`

##### Spring Boot Tomcat Service

```bash
cd services/spring/jvm/tomcat
mvn test
```

The Spring Tomcat tests use MockMvc and test:
- `/hello/platform` - Platform thread endpoint
- `/hello/virtual` - Virtual thread endpoint
- Query parameters: `sleep` and `log`

##### Spring Boot Netty Service

```bash
cd services/spring/jvm/netty
mvn test
```

The Spring Netty tests use WebTestClient and test:
- `/hello/reactive` - Reactive endpoint
- Query parameters: `sleep` and `log`

#### Running Tests in Docker

To run tests with the correct Java version, build inside Docker:

```bash
# Quarkus
cd services/quarkus/jvm
docker build --target builder -t quarkus-test .

# Spring Tomcat
cd services/spring/jvm/tomcat
docker build --target builder -t spring-tomcat-test .

# Spring Netty
cd services/spring/jvm/netty
docker build --target builder -t spring-netty-test .
```

### Go Service

Unit tests for the Go service are located in `cmd/server/main_test.go`.

#### Requirements

- Go 1.25.4+

#### Running Tests

```bash
cd services/go/hello
go test ./... -v
```

The Go tests cover:
- `/hello/platform` endpoint
- Cache initialization
- OpenTelemetry provider initialization (meter and tracer)

#### Test Output

```
=== RUN   TestPlatformEndpoint
--- PASS: TestPlatformEndpoint (0.00s)
=== RUN   TestPlatformEndpointWithCache
--- PASS: TestPlatformEndpointWithCache (0.00s)
=== RUN   TestInitNumberCache
--- PASS: TestInitNumberCache (0.00s)
=== RUN   TestInitMeterProvider
--- PASS: TestInitMeterProvider (0.00s)
=== RUN   TestInitTracerProvider
--- PASS: TestInitTracerProvider (0.00s)
PASS
ok  	hello/cmd/server	0.010s
```

## Integration Tests

Integration tests verify that services work correctly when deployed and that observability mechanisms (metrics, traces, logs) function properly.

### Location

Integration tests are in the `integration-tests/` directory.

### Requirements

- Docker and Docker Compose
- Bash shell
- curl

### Running Integration Tests

1. **Start all services**:

```bash
docker compose --project-directory compose --profile=OBS --profile=SERVICES up --no-recreate --build -d
```

2. **Wait for services to be ready** (30-60 seconds):

```bash
docker compose ps
```

3. **Run integration tests**:

```bash
cd integration-tests
./run-integration-tests.sh
```

### What Integration Tests Cover

#### Deployment Verification
- ✓ Service health checks (all services)
- ✓ REST endpoint availability and correctness
- ✓ Service connectivity

Tested endpoints:
- Quarkus: `/hello/platform`, `/hello/virtual`, `/hello/reactive`
- Spring Tomcat: `/hello/platform`, `/hello/virtual`
- Spring Netty: `/hello/reactive`
- Go: `/hello/platform`

#### Observability Mechanisms
- ✓ Metrics endpoint availability
- ✓ Grafana stack health
- ✓ Trace generation (smoke test)
- ✓ Log output (manual verification guide provided)

### Custom Service URLs

Override default service URLs with environment variables:

```bash
export QUARKUS_URL=http://localhost:8080
export SPRING_TOMCAT_URL=http://localhost:8081
export SPRING_NETTY_URL=http://localhost:8082
export GO_URL=http://localhost:8083
export GRAFANA_URL=http://localhost:3000
./run-integration-tests.sh
```

### Integration Test Output

```
==========================================
Integration Test Suite
==========================================

==========================================
Deployment Verification Tests
==========================================

--- Quarkus Service ---
Testing Quarkus Health Check... ✓ PASSED
Testing Quarkus Platform Endpoint... ✓ PASSED
Testing Quarkus Virtual Endpoint... ✓ PASSED
Testing Quarkus Reactive Endpoint... ✓ PASSED

--- Spring Boot Tomcat Service ---
Testing Spring Tomcat Health Check... ✓ PASSED
Testing Spring Tomcat Platform Endpoint... ✓ PASSED
Testing Spring Tomcat Virtual Endpoint... ✓ PASSED

--- Spring Boot Netty Service ---
Testing Spring Netty Health Check... ✓ PASSED
Testing Spring Netty Reactive Endpoint... ✓ PASSED

--- Go Service ---
Testing Go Platform Endpoint... ✓ PASSED

==========================================
Observability Mechanism Tests
==========================================

--- Metrics Collection ---
Testing Quarkus Metrics... ✓ PASSED
Testing Spring Tomcat Metrics... ✓ PASSED
Testing Spring Netty Metrics... ✓ PASSED

--- Grafana Stack ---
Testing Grafana UI... ✓ PASSED

--- Trace Generation (Smoke Test) ---
✓ Sample requests sent for trace generation

==========================================
Test Summary
==========================================
Tests Passed: 15
Tests Failed: 0
==========================================

All tests passed!
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.25'
      - name: Run Go Tests
        run: |
          cd services/go/hello
          go test ./... -v

  unit-tests-java:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          distribution: 'corretto'
          java-version: '25'
      - name: Run Quarkus Tests
        run: |
          cd services/quarkus/jvm
          mvn test
      - name: Run Spring Tomcat Tests
        run: |
          cd services/spring/jvm/tomcat
          mvn test
      - name: Run Spring Netty Tests
        run: |
          cd services/spring/jvm/netty
          mvn test

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Start Services
        run: |
          docker compose --project-directory compose \
            --profile=OBS --profile=SERVICES \
            up --no-recreate --build -d
      - name: Wait for Services
        run: sleep 60
      - name: Run Integration Tests
        run: ./integration-tests/run-integration-tests.sh
      - name: Collect Logs on Failure
        if: failure()
        run: docker compose logs
```

## Troubleshooting

### Java Version Mismatch

If you see errors like "release version 25 not supported":
- Install Java 25 (Amazon Corretto or Eclipse Temurin)
- OR run tests in Docker using the provided Dockerfiles

### Go Dependency Issues

If Go tests fail with missing dependencies:
```bash
cd services/go/hello
go mod download
go mod tidy
go test ./... -v
```

### Integration Tests Fail

Common issues:
1. **Services not running**: Start with `docker compose up`
2. **Services not ready**: Wait longer (60+ seconds for JVM warmup)
3. **Port conflicts**: Check if ports are already in use
4. **Firewall blocking**: Ensure Docker networking is properly configured

### Checking Logs

```bash
# View all logs
docker compose logs

# View specific service logs
docker compose logs quarkus-jvm
docker compose logs spring-jvm-tomcat
docker compose logs spring-jvm-netty
docker compose logs go-hello

# Follow logs in real-time
docker compose logs -f
```

## Test Coverage Summary

| Service | Unit Tests | Endpoints Tested | Status |
|---------|-----------|------------------|--------|
| Quarkus JVM | 9 tests | platform, virtual, reactive | ✅ |
| Spring Tomcat | 6 tests | platform, virtual | ✅ |
| Spring Netty | 3 tests | reactive | ✅ |
| Go | 5 tests | platform, cache, OTEL | ✅ |
| **Integration** | 15+ tests | All endpoints + observability | ✅ |

## Contributing

When adding new endpoints or services:
1. Add unit tests in `src/test/java` or `*_test.go`
2. Update integration tests in `integration-tests/run-integration-tests.sh`
3. Update this documentation
4. Ensure all tests pass before submitting PR

## References

- [JUnit 5 Documentation](https://junit.org/junit5/docs/current/user-guide/)
- [RestAssured Documentation](https://rest-assured.io/)
- [Spring Boot Testing](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing)
- [Go Testing Package](https://pkg.go.dev/testing)
- [Fiber Testing](https://docs.gofiber.io/guide/testing)
