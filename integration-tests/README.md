# Integration Tests

This directory contains integration tests for the Observability Benchmarking project.

## Overview

The integration tests verify:
1. **Deployment Setup**: Ensures all services start correctly and are accessible
2. **REST Endpoints**: Validates that all REST methods work as expected
3. **Observability Mechanisms**: Verifies metrics, traces, and logs are functioning

## Running Integration Tests

### Prerequisites

Services must be running before executing integration tests. Start services using:

```bash
docker compose --project-directory compose --profile=OBS --profile=SERVICES up --no-recreate --build -d
```

Wait for all services to be fully started (check `docker compose ps`).

### Execute Tests

```bash
cd integration-tests
./run-integration-tests.sh
```

### Custom Service URLs

Override default URLs using environment variables:

```bash
export QUARKUS_URL=http://localhost:8080
export SPRING_TOMCAT_URL=http://localhost:8081
export SPRING_NETTY_URL=http://localhost:8082
export GO_URL=http://localhost:8083
export GRAFANA_URL=http://localhost:3000
./run-integration-tests.sh
```

## Test Coverage

### Deployment Verification Tests
- ✓ Quarkus JVM service health check
- ✓ Quarkus platform, virtual, and reactive endpoints
- ✓ Spring Boot Tomcat service health check
- ✓ Spring Boot Tomcat platform and virtual endpoints
- ✓ Spring Boot Netty service health check
- ✓ Spring Boot Netty reactive endpoint
- ✓ Go service platform endpoint

### Observability Mechanism Tests
- ✓ Metrics endpoint accessibility (all services)
- ✓ Grafana stack availability
- ✓ Trace generation smoke test
- ✓ Log output verification (manual check required)

## Output

The test script provides colored output:
- 🟢 Green ✓ for passed tests
- 🔴 Red ✗ for failed tests
- 🟡 Yellow for informational messages

Example output:
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

...

==========================================
Test Summary
==========================================
Tests Passed: 15
Tests Failed: 0
==========================================
```

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

## Troubleshooting

### Service Not Responding

If tests fail with connection errors:
1. Verify services are running: `docker compose ps`
2. Check service logs: `docker compose logs <service-name>`
3. Ensure ports are not blocked by firewall
4. Wait longer for services to fully start (especially JVM services need warmup time)

### Health Checks Failing

Different services use different health check endpoints:
- Quarkus: `/q/health/live`
- Spring Boot: `/actuator/health`
- Go: Custom implementation

The test script attempts all common endpoints automatically.

## Manual Log Verification

To manually verify logs are being generated:

```bash
# Check Quarkus logs
docker compose logs quarkus-jvm | grep -i 'hello'

# Check Spring Tomcat logs
docker compose logs spring-jvm-tomcat | grep -i 'hello'

# Check Spring Netty logs
docker compose logs spring-jvm-netty | grep -i 'hello'

# Check Go logs
docker compose logs go-hello | grep -i 'hello'
```

## CI Integration

This test suite can be integrated into CI/CD pipelines:

```bash
# Example GitHub Actions workflow
- name: Start services
  run: docker compose --project-directory compose --profile=OBS --profile=SERVICES up -d

- name: Wait for services
  run: sleep 60

- name: Run integration tests
  run: ./integration-tests/run-integration-tests.sh
```
