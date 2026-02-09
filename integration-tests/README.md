# Integration Tests

> Comprehensive integration tests for verifying deployment setup and observability mechanisms for all JVM and Native services.

## Overview

This directory contains integration tests that validate:
- **JVM Services**: All JVM-based services (Spring Boot, Quarkus, Go)
- **Native Services**: All GraalVM Native Image services (Spring Native, Quarkus Native)
- **Observability Stack**: Metrics, traces, and logs are collected properly
- **Framework Functionality**: Latest framework versions (Quarkus 3.31.2, Spring Boot 4.0.2, Go 1.25.7)

## Quick Start

### Prerequisites

1. **Docker & Docker Compose**
   ```bash
   docker --version      # Requires 20.10+
   docker compose version # Requires 2.0+
   ```

2. **Command-line Tools**
   ```bash
   curl --version
   bash --version        # Requires 4.0+
   ```

3. **Port Availability**
   - 8080-8100: Java Service ports
   - 9080-9081: Go Service ports
   - 3000: Grafana
   - 3001: NextJS Dash
   - 4317, 4318: OTLP endpoints

### Running Tests

Run from the root directory of this repo.

> Note: The test runner assumes the Docker Compose stack is already up. It does not start containers by itself.

1. Set wrk2 to not autostart benchmarking (prevent skewing tests) and start everything via Docker Compose

    ```powerShell
    #powershell
    $env:WRK_AUTORUN="false"; docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate -d
    ```
    or
    ```bash
    #bash
    WRK_AUTORUN=false docker compose --project-directory compose --profile=OBS --profile=SERVICES --profile=RAIN_FIRE up --no-recreate -d
    ```

2. Wait for services to initialize (less than a minute if everything was pre-built / cached)
   * For some reason Loki, Tempo and Pyroscope might need additional probe(s) after boot to reply with 200

3. Run integration tests
```bash
bash ./integration-tests/run-integration-tests.sh
```

## Test Script

### Features

- **Automated Testing**: Tests all JVM and Native services automatically
- **Colored Output**: Blue headers, Green (✓) for pass, Red (✗) for fail
- **Exit Codes**: Returns 0 for success, 1 for failures (CI/CD friendly)
- **Configurable**: Override service URLs via environment variables
- **Comprehensive**: Tests deployment, metrics, traces, and logs
- **Resilient**: Continues testing even if individual tests fail
- **Run logging**: Saves a timestamped log file under `integration-tests/output/` for every run
- **wrk2 smoke checks**: Verifies wrk2 readiness endpoint and on-demand exec

### Logging

Each run writes a log file to:

- `integration-tests/output/YYYYMMDD_HHmmss.log`

The `integration-tests/output/` folder is intentionally **gitignored** (it contains per-run artifacts).

At the top of the log you will see a **Run Environment** header with host/terminal details (useful for comparing runs across machines).

### Configuration

Override default URLs (matches docker-compose.yml port order):

```bash
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
export GO_URL=http://localhost:9080

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

# wrk2 readiness + exec smoke test
# - The script waits for WRK2_READY_URL to return 200, then runs a tiny wrk command inside the wrk2 container.
# - The test only passes if the wrk output contains "Transfer/sec".
export WRK2_READY_URL=http://localhost:3003/ready
export WRK2_CONTAINER_NAME=wrk2

./run-integration-tests.sh
```

### Framework Versions

The tests are designed for these specific versions:

| Framework   | Version | Notes                                   |
|-------------|---------|-----------------------------------------|
| Quarkus     | 3.31.2  | OpenTelemetry SDK (not Java agent)      |
| Spring Boot | 4.0.2   | OpenTelemetry Java Agent, no parent POM |
| Go          | 1.25.7  | Fiber v2.52.11, OpenTelemetry Go SDK    |

## Service Port Mappings

Port mappings match the order in docker-compose.yml:

| Service                            | Container Name                | Port | Type               |
|------------------------------------|-------------------------------|------|--------------------|
| Spring Boot Tomcat Platform        | spring-jvm-tomcat-platform    | 8080 | JVM                |
| Spring Boot Tomcat Virtual         | spring-jvm-tomcat-virtual     | 8081 | JVM                |
| Spring Boot Netty                  | spring-jvm-netty              | 8082 | JVM                |
| Spring Boot Native Tomcat Platform | spring-native-tomcat-platform | 8083 | Native             |
| Spring Boot Native Tomcat Virtual  | spring-native-tomcat-virtual  | 8084 | Native             |
| Spring Boot Native Netty           | spring-native-netty           | 8085 | Native             |
| Quarkus JVM                        | quarkus-jvm                   | 8086 | JVM                |
| Quarkus Native                     | quarkus-native                | 8087 | Native             |
| Go                                 | go                            | 9080 | Native (Go binary) |

## Test Scenarios

### JVM Services - Deployment Tests (7 tests)

| Service                | Port | Endpoint          | Expected Response  |
|------------------------|------|-------------------|--------------------|
| Spring Tomcat Platform | 8080 | `/hello/platform` | Contains "Boot"    |
| Spring Tomcat Virtual  | 8081 | `/hello/virtual`  | Contains "Boot"    |
| Spring Netty           | 8082 | `/hello/reactive` | Contains "Boot"    |
| Quarkus JVM            | 8086 | `/hello/platform` | Contains "Quarkus" |
| Quarkus JVM            | 8086 | `/hello/virtual`  | Contains "Quarkus" |
| Quarkus JVM            | 8086 | `/hello/reactive` | Contains "Quarkus" |

### Native Services - Deployment Tests (7 tests)

| Service                       | Port | Endpoint          | Expected Response  |
|-------------------------------|------|-------------------|--------------------|
| Spring Native Tomcat Platform | 8083 | `/hello/platform` | Contains "Boot"    |
| Spring Native Tomcat Virtual  | 8084 | `/hello/virtual`  | Contains "Boot"    |
| Spring Native Netty           | 8085 | `/hello/reactive` | Contains "Boot"    |
| Quarkus Native                | 8087 | `/hello/platform` | Contains "Quarkus" |
| Quarkus Native                | 8087 | `/hello/virtual`  | Contains "Quarkus" |
| Quarkus Native                | 8087 | `/hello/reactive` | Contains "Quarkus" |

### Go Service - Deployment Test (1 test)

| Service  | Port | Endpoint         | Expected Response |
|----------|------|------------------|-------------------|
| Go Fiber | 9080 | `/hello/virtual` | Contains "GO"     |

### wrk2 Readiness + On-demand Exec (2 checks)

The suite includes a small wrk2 validation:

1. Waits for the wrk2 readiness endpoint to return 200:
   - default: `http://localhost:3003/ready`
2. Runs a minimal on-demand exec inside the wrk2 container:
   - `/wrk2/wrk -t1 -c1 -d1s -R1 --timeout 3s http://0.0.0.0:3003/ready`
   - the test **must** contain `Transfer/sec` in the output to pass

### Observability Verification (10+ tests)

Tests that observability mechanisms work:

#### Metrics Collection

- ✅ Spring Boot JVM services metrics (`/actuator/prometheus`)
- ✅ Spring Boot Native services metrics (`/actuator/prometheus`)
- ✅ Quarkus JVM metrics (`/q/metrics`)
- ✅ Quarkus Native metrics (`/q/metrics`)
- ✅ Custom counters present in services:
  - `hello_request_count_total{endpoint="/hello/platform"}`
  - `hello_request_count_total{endpoint="/hello/virtual"}`
  - `hello_request_count_total{endpoint="/hello/reactive"}`

#### Grafana Stack

- ✅ Grafana UI accessible at http://localhost:3000
- ✅ Health endpoint returns 200 OK
- ✅ Data sources connected (Prometheus, Loki, Tempo)

#### Trace Generation

- ✅ Sample requests sent to all services (JVM, Native, and Go)
- ✅ Traces should appear in Grafana Tempo (manual verification)
- ✅ OTLP endpoints receiving data

#### Log Aggregation

- ✅ Logs collected by Loki (manual verification required)
- Script provides commands to check logs for all services

## Expected Output

Example (trimmed):

```
[integration-tests] logging to: integration-tests/output/20260113_201010.log

==========================================
Run Environment
==========================================
Host OS: ...
Terminal / session:
  stdin:  ...
  stdout: ...
  stderr: ...
...
Timestamp (host): 2026-01-13T20:10:10+02:00
==========================================

==========================================
Integration Test Suite
==========================================

...

--- wrk2 Readiness + On-demand Exec ---
Waiting for wrk2 (/ready) to be ready... ✓ READY
wrk2 exec self-ready check (printing wrk output below):
----- wrk2 exec output (begin) -----
...
Transfer/sec: ...
----- wrk2 exec output (end) -----
✓ PASSED

--- Trace Generation (Smoke Test) ---
Generating request to create trace and verify container log output...
Trace log check Go Virtual (go)... ✓ PASSED (found 'goroutine')

==========================================
Test Summary
==========================================
Tests Passed: 45
Tests Failed: 0
==========================================

✅ All tests passed!

[integration-tests] suite finished successfully
```


## Troubleshooting

### Services Not Starting

**Problem**: Services don't start or crash immediately

**Solutions**:

```bash
# Check container status
docker compose --project-directory ../compose ps

# View logs for specific service
docker compose --project-directory ../compose logs quarkus-jvm

# Check for port conflicts
sudo lsof -i :8080

# Rebuild and restart
docker compose --project-directory ../compose down
docker compose --project-directory ../compose --profile=OBS --profile=SERVICES up --build -d
```

### Connection Refused

**Problem**: Tests fail with "Connection refused"

**Solutions**:

```bash
# Wait longer for services to start
sleep 120
./run-integration-tests.sh

# Check if services are listening
curl http://localhost:8080/hello/platform  # Spring JVM
curl http://localhost:8083/hello/platform  # Spring Native
curl http://localhost:8086/hello/platform  # Quarkus JVM
curl http://localhost:8087/hello/platform  # Quarkus Native
curl http://localhost:9080/hello/virtual   # Go

# Verify Docker network
docker network ls
docker network inspect compose_default
```

### Native Images Taking Long to Start

**Problem**: Native image services (ports 8083-8085, 8087) timeout during tests

**Note**: Native images have faster startup than JVM services but may still take 30-60 seconds depending on system resources.

**Solutions**:

```bash
# Check native service logs for startup progress
docker compose --project-directory ../compose logs spring-native-tomcat-platform
docker compose --project-directory ../compose logs quarkus-native

# Increase wait time before running tests
sleep 120

# Test native services individually
curl http://localhost:8083/hello/platform  # Spring Native Tomcat Platform
curl http://localhost:8084/hello/virtual   # Spring Native Tomcat Virtual
curl http://localhost:8085/hello/reactive  # Spring Native Netty
curl http://localhost:8087/hello/platform  # Quarkus Native
```

### Metrics Not Available

**Problem**: Metrics endpoints return 404

**Solutions**:

```bash
# Check correct endpoint for each service type
# Quarkus (JVM and Native):
curl http://localhost:8086/q/metrics  # Quarkus JVM
curl http://localhost:8087/q/metrics  # Quarkus Native

# Spring Boot (JVM and Native):
curl http://localhost:8080/actuator/prometheus  # Spring JVM Tomcat Platform
curl http://localhost:8083/actuator/prometheus  # Spring Native Tomcat Platform

# Verify metrics are being generated
curl http://localhost:8086/hello/platform
sleep 5
curl http://localhost:8086/q/metrics | grep hello_request_count
```

### Traces Not Appearing

**Problem**: No traces visible in Grafana Tempo

**Solutions**:

```bash
# Check Alloy (collector) is running
docker compose --project-directory ../compose logs alloy

# Check Tempo is running
docker compose --project-directory ../compose logs tempo

# Generate more requests
for i in {1..100}; do curl http://localhost:8086/hello/platform; done

# Wait for export (5-10 seconds)
sleep 10

# Check Grafana Tempo UI
# Open: http://localhost:3000/explore
# Select: Tempo
# Search for recent traces
```

### Grafana Not Accessible

**Problem**: Cannot access Grafana at http://localhost:3000

**Solutions**:

```bash
# Check Grafana container status
docker compose --project-directory ../compose ps grafana

# Check Grafana logs
docker compose --project-directory ../compose logs grafana

# Verify port is not in use
sudo lsof -i :3000

# Restart Grafana
docker compose --project-directory ../compose restart grafana
```

### Test Failures

**Problem**: One or more tests fail

**Solutions**:

```bash
# Run test with verbose output
VERBOSE=true ./run-integration-tests.sh

# Test individual endpoint manually
curl -v http://localhost:8086/hello/platform

# Check service-specific logs
docker compose --project-directory ../compose logs quarkus-jvm | tail -50

# Verify Java version in containers
docker exec -it quarkus-jvm java -version

# Check resource usage
docker stats --no-stream
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Start Services
        run: |
          docker compose --project-directory compose --profile=OBS --profile=SERVICES up --build -d
          sleep 60
      
      - name: Run Integration Tests
        run: |
          cd integration-tests
          chmod +x run-integration-tests.sh
          ./run-integration-tests.sh
      
      - name: Collect Logs on Failure
        if: failure()
        run: |
          mkdir -p logs
          docker compose --project-directory compose logs > logs/all-services.log
      
      - name: Upload Logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: integration-test-logs
          path: logs/
      
      - name: Cleanup
        if: always()
        run: |
          docker compose --project-directory compose down -v
```

### GitLab CI

```yaml
integration-tests:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  
  before_script:
    - apk add --no-cache docker-compose curl bash
  
  script:
    - docker compose --project-directory compose --profile=OBS --profile=SERVICES up --build -d
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
```

### Jenkins

```groovy
pipeline {
    agent any
    
    stages {
        stage('Start Services') {
            steps {
                sh '''
                    docker compose --project-directory compose --profile=OBS --profile=SERVICES up --build -d
                    sleep 60
                '''
            }
        }
        
        stage('Run Integration Tests') {
            steps {
                sh '''
                    cd integration-tests
                    chmod +x run-integration-tests.sh
                    ./run-integration-tests.sh
                '''
            }
        }
    }
    
    post {
        failure {
            sh 'docker compose --project-directory compose logs > integration-logs.txt'
            archiveArtifacts artifacts: 'integration-logs.txt'
        }
        always {
            sh 'docker compose --project-directory compose down -v'
        }
    }
}
```

## Manual Verification

After running automated tests, manually verify:

### 1. View Metrics in Grafana

```bash
# Open Grafana
open http://localhost:3000  # macOS
xdg-open http://localhost:3000  # Linux

# Login: a/a
# Navigate to: Explore → Prometheus
# Query: hello_request_count_total
# Expected: See request counts for all services
```

### 2. View Traces in Grafana

```bash
# In Grafana: Explore → Tempo
# Click "Search"
# Select recent time range (Last 15 minutes)
# Expected: See traces from all services
# Click trace to see span details
```

### 3. View Logs in Grafana

```bash
# In Grafana: Explore → Loki
# Query: {service_name="quarkus-jvm"}
# Expected: See application logs
# Try filters: |= "INFO" or |= "platform"
```

### 4. Check Service Dashboards

```bash
# In Grafana: Dashboards
# Look for:
# - JVM Dashboard (memory, GC, threads)
# - HTTP Request Dashboard (RPS, latency)
# - Service Overview Dashboard
```

## Advanced Testing

### Load Testing

Generate significant load to test observability under stress:

```bash
# Start services
docker compose --project-directory ../compose --profile=OBS --profile=SERVICES up -d

# Run load test (requires wrk2)
docker run --rm --network compose_default \
  williamyeh/wrk2:latest \
  -t4 -c10 -d60s -R5000 --latency \
  http://quarkus-jvm:8080/hello/platform

# Run integration tests to verify metrics/traces
./run-integration-tests.sh
```

### Chaos Testing

Test system resilience:

```bash
# Start services
docker compose --project-directory ../compose --profile=OBS --profile=SERVICES up -d

# Kill a service
docker kill quarkus-jvm

# Verify other services still work
./run-integration-tests.sh || true

# Restart service
docker compose --project-directory ../compose up -d quarkus-jvm

# Wait and verify
sleep 30
./run-integration-tests.sh
```

### Performance Baseline

Establish performance baselines:

```bash
# Run multiple iterations
for i in {1..5}; do
  echo "Iteration $i"
  docker compose --project-directory ../compose down
  docker compose --project-directory ../compose --profile=SERVICES up -d
  sleep 60
  
  # Warm up
  for j in {1..1000}; do
    curl -s http://localhost:8086/hello/platform > /dev/null
  done
  
  # Measure
  time for j in {1..1000}; do
    curl -s http://localhost:8086/hello/platform > /dev/null
  done
done
```

## Continuous Improvement

### Adding New Tests

To add a new test scenario:

1. Add test function to `run-integration-tests.sh`
2. Use existing helper functions (`test_endpoint`, `test_metrics`)
3. Update test counters
4. Document in this README

Example:

```bash
# Add to script
test_endpoint "New Service Health" "${NEW_SERVICE_URL}/health" 200 "UP"

# Update documentation
| New Service | 8090 | `/health` | Contains "UP" |
```

### Monitoring Test Results

Track test metrics over time:

- **Success Rate**: % of passing tests
- **Execution Time**: Total test duration
- **Failure Patterns**: Common failure modes
- **Coverage**: New features tested

### Best Practices

1. **Run Before Deploy**: Always run integration tests before deploying
2. **Version Pin**: Keep framework versions in sync with services
3. **Fast Feedback**: Optimize test execution time (< 2 minutes)
4. **Clear Output**: Make failures easy to diagnose
5. **Automate**: Run in CI/CD pipeline automatically

## Additional Resources

- [Main Testing Guide](../docs/TESTING.md)
- [Project Structure](../docs/STRUCTURE.md)
- [Docker Compose Configuration](../compose/docker-compose.yml)
- [Service READMEs](../services/README.md)

---

**Last Updated**: December 2025  
**Maintainer**: Observability-Benchmarking Team
