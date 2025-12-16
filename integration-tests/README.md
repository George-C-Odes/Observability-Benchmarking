# Integration Tests

> Comprehensive integration tests for verifying deployment setup and observability mechanisms.

## Overview

This directory contains integration tests that validate:
- **Service Deployment**: All services start correctly and respond to HTTP requests
- **Observability Stack**: Metrics, traces, and logs are collected properly
- **Inter-service Communication**: Services can communicate through the Docker network
- **Framework Functionality**: Latest framework versions (Quarkus 3.30.3, Spring Boot 4.0.0, Go 1.25.5) work correctly

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
   - 8080-8087: Service ports
   - 3000: Grafana
   - 4317-4318: OTLP endpoints

### Running Tests

```bash
# 1. Start all services
docker compose --project-directory ../compose --profile=OBS --profile=SERVICES up --build -d

# 2. Wait for services to initialize (30-60 seconds)
sleep 60

# 3. Run integration tests
./run-integration-tests.sh
```

## Test Script

### Features

- **Automated Testing**: Runs 15+ test scenarios automatically
- **Colored Output**: Green (✓) for pass, Red (✗) for fail
- **Exit Codes**: Returns 0 for success, 1 for failures (CI/CD friendly)
- **Configurable**: Override service URLs via environment variables
- **Comprehensive**: Tests deployment, metrics, traces, and logs

### Configuration

Override default URLs:

```bash
export SPRING_TOMCAT_PLATFORM_URL=http://localhost:8080
export SPRING_TOMCAT_VIRTUAL_URL=http://localhost:8081
export SPRING_NETTY_URL=http://localhost:8082
export GO_URL=http://localhost:8083
export QUARKUS_URL=http://localhost:8086
export GRAFANA_URL=http://localhost:3000

./run-integration-tests.sh
```

### Framework Versions

The tests are designed for these specific versions:

| Framework | Version | Notes |
|-----------|---------|-------|
| Quarkus | 3.30.3 | OpenTelemetry SDK (not Java agent) |
| Spring Boot | 4.0.0 | OpenTelemetry Java Agent, no parent POM |
| Go | 1.25.5 | Fiber v2.52.10, OpenTelemetry Go SDK |

## Test Scenarios

### Deployment Verification (7 tests)

Tests that all services respond correctly:

| Service | Port | Endpoint | Expected Response |
|---------|------|----------|-------------------|
| Quarkus JVM | 8086 | `/hello/platform` | Contains "Quarkus platform" |
| Quarkus JVM | 8086 | `/hello/virtual` | Contains "Quarkus virtual" |
| Quarkus JVM | 8086 | `/hello/reactive` | Contains "Quarkus reactive" |
| Spring Tomcat (Platform) | 8080 | `/hello/platform` | Contains "Boot platform" |
| Spring Tomcat (Virtual) | 8081 | `/hello/virtual` | Contains "Boot virtual" |
| Spring Netty | 8082 | `/hello/reactive` | Contains "Boot reactive" |
| Go Fiber | 8083 | `/hello/platform` | Contains "GO REST" |

### Observability Verification (8+ tests)

Tests that observability mechanisms work:

#### Metrics Collection

- ✅ Quarkus metrics endpoint (`/q/metrics`) returns valid Prometheus format
- ✅ Spring Boot metrics endpoints (`/actuator/prometheus`) return valid format
- ✅ Custom counters present:
  - `hello_request_count_total{endpoint="/hello/platform"}` (Java services)
  - `go_request_count_total` (Go service)

#### Grafana Stack

- ✅ Grafana UI accessible at http://localhost:3000
- ✅ Health endpoint returns 200 OK
- ✅ Data sources connected (Prometheus, Loki, Tempo)

#### Trace Generation

- ✅ Sample requests sent to all services
- ✅ Traces should appear in Grafana Tempo (manual verification)
- ✅ OTLP endpoints receiving data

#### Log Aggregation

- ✅ Logs collected by Loki (manual verification required)
- Script provides commands to check logs

## Expected Output

```
==========================================
Integration Test Suite
==========================================

Testing Framework Versions:
- Quarkus: 3.30.3
- Spring Boot: 4.0.0
- Go: 1.25.5

==========================================
Deployment Verification Tests
==========================================

--- Quarkus JVM Service (port 8086) ---
Testing Quarkus Platform Endpoint... ✓ PASSED
Testing Quarkus Virtual Endpoint... ✓ PASSED
Testing Quarkus Reactive Endpoint... ✓ PASSED

--- Spring Boot Tomcat (Platform - port 8080) ---
Testing Spring Tomcat Platform Endpoint... ✓ PASSED

--- Spring Boot Tomcat (Virtual - port 8081) ---
Testing Spring Tomcat Virtual Endpoint... ✓ PASSED

--- Spring Boot Netty (port 8082) ---
Testing Spring Netty Reactive Endpoint... ✓ PASSED

--- Go Fiber (port 8083) ---
Testing Go Platform Endpoint... ✓ PASSED

==========================================
Observability Mechanism Tests
==========================================

--- Metrics Collection ---
Testing Quarkus Metrics... ✓ PASSED
Testing Spring Tomcat Platform Metrics... ✓ PASSED
Testing Spring Tomcat Virtual Metrics... ✓ PASSED
Testing Spring Netty Metrics... ✓ PASSED

--- Grafana Stack ---
Testing Grafana UI... ✓ PASSED

--- Trace Generation (Smoke Test) ---
Generating sample requests to create traces...
✓ Sample requests sent for trace generation

--- Log Output Verification ---
Note: Log verification requires checking container logs manually
Run: docker compose --project-directory compose logs quarkus-jvm | grep -i 'hello'
Run: docker compose --project-directory compose logs spring-jvm-tomcat-platform | grep -i 'hello'
Run: docker compose --project-directory compose logs spring-jvm-tomcat-virtual | grep -i 'hello'
Run: docker compose --project-directory compose logs spring-jvm-netty | grep -i 'hello'
Run: docker compose --project-directory compose logs go-hello | grep -i 'hello'

==========================================
Test Summary
==========================================
Tests Passed: 13
Tests Failed: 0
==========================================

All tests passed!
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
sleep 90
./run-integration-tests.sh

# Check if services are listening
curl http://localhost:8086/hello/platform
curl http://localhost:8080/hello/platform

# Verify Docker network
docker network ls
docker network inspect compose_default
```

### Metrics Not Available

**Problem**: Metrics endpoints return 404

**Solutions**:

```bash
# Check correct endpoint for each service
# Quarkus:
curl http://localhost:8086/q/metrics

# Spring Boot:
curl http://localhost:8080/actuator/prometheus

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
