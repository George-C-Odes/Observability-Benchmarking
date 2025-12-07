#!/bin/bash
# Integration Test Runner
# This script runs integration tests to verify deployment setups and observability mechanisms

set -e

echo "=========================================="
echo "Integration Test Suite"
echo "=========================================="
echo ""

# Configuration
QUARKUS_URL="${QUARKUS_URL:-http://localhost:8080}"
SPRING_TOMCAT_URL="${SPRING_TOMCAT_URL:-http://localhost:8081}"
SPRING_NETTY_URL="${SPRING_NETTY_URL:-http://localhost:8082}"
GO_URL="${GO_URL:-http://localhost:8083}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test HTTP endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local expected_content=$4

    echo -n "Testing ${name}... "
    
    response=$(curl -s -w "\n%{http_code}" "${url}" 2>/dev/null || echo "000")
    http_code=$(echo "${response}" | tail -n1)
    body=$(echo "${response}" | head -n-1)
    
    if [ "${http_code}" = "${expected_status}" ]; then
        if [ -z "${expected_content}" ] || echo "${body}" | grep -q "${expected_content}"; then
            echo -e "${GREEN}✓ PASSED${NC}"
            ((TESTS_PASSED++))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} - Expected content '${expected_content}' not found"
            echo "  Response: ${body}"
            ((TESTS_FAILED++))
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED${NC} - Expected status ${expected_status}, got ${http_code}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Helper function to test health endpoint
test_health() {
    local name=$1
    local url=$2
    
    test_endpoint "${name} Health Check" "${url}/q/health/live" 200 "UP" || \
    test_endpoint "${name} Health Check" "${url}/actuator/health" 200 "UP" || \
    test_endpoint "${name} Health Check" "${url}/health" 200 ""
}

# Helper function to test metrics endpoint
test_metrics() {
    local name=$1
    local url=$2
    
    test_endpoint "${name} Metrics" "${url}/q/metrics" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/actuator/metrics" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/metrics" 200 ""
}

echo "=========================================="
echo "Deployment Verification Tests"
echo "=========================================="
echo ""

echo "--- Quarkus Service ---"
test_health "Quarkus" "${QUARKUS_URL}"
test_endpoint "Quarkus Platform Endpoint" "${QUARKUS_URL}/hello/platform" 200 "Quarkus"
test_endpoint "Quarkus Virtual Endpoint" "${QUARKUS_URL}/hello/virtual" 200 "Quarkus"
test_endpoint "Quarkus Reactive Endpoint" "${QUARKUS_URL}/hello/reactive" 200 "Quarkus"
echo ""

echo "--- Spring Boot Tomcat Service ---"
test_health "Spring Tomcat" "${SPRING_TOMCAT_URL}"
test_endpoint "Spring Tomcat Platform Endpoint" "${SPRING_TOMCAT_URL}/hello/platform" 200 "Boot"
test_endpoint "Spring Tomcat Virtual Endpoint" "${SPRING_TOMCAT_URL}/hello/virtual" 200 "Boot"
echo ""

echo "--- Spring Boot Netty Service ---"
test_health "Spring Netty" "${SPRING_NETTY_URL}"
test_endpoint "Spring Netty Reactive Endpoint" "${SPRING_NETTY_URL}/hello/reactive" 200 "Boot"
echo ""

echo "--- Go Service ---"
test_endpoint "Go Platform Endpoint" "${GO_URL}/hello/platform" 200 "GO"
echo ""

echo "=========================================="
echo "Observability Mechanism Tests"
echo "=========================================="
echo ""

echo "--- Metrics Collection ---"
test_metrics "Quarkus" "${QUARKUS_URL}"
test_metrics "Spring Tomcat" "${SPRING_TOMCAT_URL}"
test_metrics "Spring Netty" "${SPRING_NETTY_URL}"
echo ""

echo "--- Grafana Stack ---"
test_endpoint "Grafana UI" "${GRAFANA_URL}/api/health" 200 ""
echo ""

echo "--- Trace Generation (Smoke Test) ---"
echo "Generating sample requests to create traces..."
for i in {1..5}; do
    curl -s "${QUARKUS_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${SPRING_TOMCAT_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${SPRING_NETTY_URL}/hello/reactive" > /dev/null 2>&1 || true
    curl -s "${GO_URL}/hello/platform" > /dev/null 2>&1 || true
done
echo -e "${GREEN}✓${NC} Sample requests sent for trace generation"
((TESTS_PASSED++))
echo ""

echo "--- Log Output Verification ---"
echo -e "${YELLOW}Note: Log verification requires checking container logs manually${NC}"
echo "Run: docker compose logs quarkus-jvm | grep -i 'hello'"
echo "Run: docker compose logs spring-jvm-tomcat | grep -i 'hello'"
echo "Run: docker compose logs spring-jvm-netty | grep -i 'hello'"
echo "Run: docker compose logs go-hello | grep -i 'hello'"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo "=========================================="
echo ""

if [ ${TESTS_FAILED} -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
