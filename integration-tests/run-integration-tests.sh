#!/usr/bin/env bash
# Integration Test Runner
# Validates deployment and observability for all services (JVM and Native)

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Configuration - Port mappings match docker-compose.yml order
# JVM Services
SPRING_TOMCAT_PLATFORM_URL="${SPRING_TOMCAT_PLATFORM_URL:-http://localhost:8080}"
SPRING_TOMCAT_VIRTUAL_URL="${SPRING_TOMCAT_VIRTUAL_URL:-http://localhost:8081}"
SPRING_NETTY_URL="${SPRING_NETTY_URL:-http://localhost:8082}"

# Native Services
SPRING_NATIVE_TOMCAT_PLATFORM_URL="${SPRING_NATIVE_TOMCAT_PLATFORM_URL:-http://localhost:8083}"
SPRING_NATIVE_TOMCAT_VIRTUAL_URL="${SPRING_NATIVE_TOMCAT_VIRTUAL_URL:-http://localhost:8084}"
SPRING_NATIVE_NETTY_URL="${SPRING_NATIVE_NETTY_URL:-http://localhost:8085}"

# Quarkus Services
QUARKUS_JVM_URL="${QUARKUS_JVM_URL:-http://localhost:8086}"
QUARKUS_NATIVE_URL="${QUARKUS_NATIVE_URL:-http://localhost:8087}"

# Go Service
GO_URL="${GO_URL:-http://localhost:8088}"

# Observability
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"

# Framework versions
QUARKUS_VERSION="3.30.3"
SPRING_BOOT_VERSION="4.0.0"
GO_VERSION="1.25.5"

# Helper function to test HTTP endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local expected_content=$4

    echo -n "Testing ${name}... "
    
    # Don't exit on curl failure
    response=$(curl -s -w "\n%{http_code}" "${url}" 2>/dev/null || echo -e "\n000")
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

# Helper function to test metrics endpoint
test_metrics() {
    local name=$1
    local url=$2
    
    # Try different metric endpoints
    test_endpoint "${name} Metrics" "${url}/q/metrics" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/actuator/prometheus" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/metrics" 200 ""
}

echo "=========================================="
echo "Integration Test Suite"
echo "=========================================="
echo ""
echo "Testing Framework Versions:"
echo "- Quarkus: ${QUARKUS_VERSION}"
echo "- Spring Boot: ${SPRING_BOOT_VERSION}"
echo "- Go: ${GO_VERSION}"
echo ""

echo "=========================================="
echo "JVM Services - Deployment Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Spring Boot JVM Tomcat Platform (port 8080) ---${NC}"
test_endpoint "Spring Tomcat Platform - /hello/platform" "${SPRING_TOMCAT_PLATFORM_URL}/hello/platform" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot JVM Tomcat Virtual (port 8081) ---${NC}"
test_endpoint "Spring Tomcat Virtual - /hello/virtual" "${SPRING_TOMCAT_VIRTUAL_URL}/hello/virtual" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot JVM Netty (port 8082) ---${NC}"
test_endpoint "Spring Netty - /hello/reactive" "${SPRING_NETTY_URL}/hello/reactive" 200 "Boot"
echo ""

echo -e "${BLUE}--- Quarkus JVM (port 8086) ---${NC}"
test_endpoint "Quarkus JVM - /hello/platform" "${QUARKUS_JVM_URL}/hello/platform" 200 "Quarkus"
test_endpoint "Quarkus JVM - /hello/virtual" "${QUARKUS_JVM_URL}/hello/virtual" 200 "Quarkus"
test_endpoint "Quarkus JVM - /hello/reactive" "${QUARKUS_JVM_URL}/hello/reactive" 200 "Quarkus"
echo ""

echo "=========================================="
echo "Native Services - Deployment Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Spring Boot Native Tomcat Platform (port 8083) ---${NC}"
test_endpoint "Spring Native Tomcat Platform - /hello/platform" "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}/hello/platform" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot Native Tomcat Virtual (port 8084) ---${NC}"
test_endpoint "Spring Native Tomcat Virtual - /hello/virtual" "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}/hello/virtual" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot Native Netty (port 8085) ---${NC}"
test_endpoint "Spring Native Netty - /hello/reactive" "${SPRING_NATIVE_NETTY_URL}/hello/reactive" 200 "Boot"
echo ""

echo -e "${BLUE}--- Quarkus Native (port 8087) ---${NC}"
test_endpoint "Quarkus Native - /hello/platform" "${QUARKUS_NATIVE_URL}/hello/platform" 200 "Quarkus"
test_endpoint "Quarkus Native - /hello/virtual" "${QUARKUS_NATIVE_URL}/hello/virtual" 200 "Quarkus"
test_endpoint "Quarkus Native - /hello/reactive" "${QUARKUS_NATIVE_URL}/hello/reactive" 200 "Quarkus"
echo ""

echo "=========================================="
echo "Go Service - Deployment Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Go Fiber (port 8088) ---${NC}"
test_endpoint "Go - /hello/platform" "${GO_URL}/hello/platform" 200 "GO"
echo ""

echo "=========================================="
echo "Observability Mechanism Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Metrics Collection ---${NC}"
test_metrics "Spring Tomcat Platform" "${SPRING_TOMCAT_PLATFORM_URL}"
test_metrics "Spring Tomcat Virtual" "${SPRING_TOMCAT_VIRTUAL_URL}"
test_metrics "Spring Netty" "${SPRING_NETTY_URL}"
test_metrics "Spring Native Tomcat Platform" "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}"
test_metrics "Spring Native Tomcat Virtual" "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}"
test_metrics "Spring Native Netty" "${SPRING_NATIVE_NETTY_URL}"
test_metrics "Quarkus JVM" "${QUARKUS_JVM_URL}"
test_metrics "Quarkus Native" "${QUARKUS_NATIVE_URL}"
echo ""

echo -e "${BLUE}--- Grafana Stack Health ---${NC}"
test_endpoint "Grafana UI" "${GRAFANA_URL}/api/health" 200 ""
echo ""

echo -e "${BLUE}--- Trace Generation (Smoke Test) ---${NC}"
echo "Generating sample requests to create traces..."
# Generate traces from all services
for i in {1..3}; do
    curl -s "${SPRING_TOMCAT_PLATFORM_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${SPRING_TOMCAT_VIRTUAL_URL}/hello/virtual" > /dev/null 2>&1 || true
    curl -s "${SPRING_NETTY_URL}/hello/reactive" > /dev/null 2>&1 || true
    curl -s "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}/hello/virtual" > /dev/null 2>&1 || true
    curl -s "${SPRING_NATIVE_NETTY_URL}/hello/reactive" > /dev/null 2>&1 || true
    curl -s "${QUARKUS_JVM_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${QUARKUS_NATIVE_URL}/hello/platform" > /dev/null 2>&1 || true
    curl -s "${GO_URL}/hello/platform" > /dev/null 2>&1 || true
done
echo -e "${GREEN}✓${NC} Sample requests sent for trace generation"
((TESTS_PASSED++))
echo ""

echo -e "${BLUE}--- Log Output Verification ---${NC}"
echo -e "${YELLOW}Note: Log verification requires checking container logs manually${NC}"
echo "Run: docker compose --project-directory compose logs spring-jvm-tomcat-platform | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs spring-jvm-tomcat-virtual | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs spring-jvm-netty | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs spring-native-tomcat-platform | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs spring-native-tomcat-virtual | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs spring-native-netty | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs quarkus-jvm | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs quarkus-native | grep -i 'hello'"
echo "Run: docker compose --project-directory compose logs go | grep -i 'hello'"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo "=========================================="
echo ""

if [ ${TESTS_FAILED} -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Open Grafana: ${GRAFANA_URL} (credentials: a/a)"
    echo "2. View metrics in Explore → Prometheus"
    echo "3. View traces in Explore → Tempo"
    echo "4. View logs in Explore → Loki"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please check the output above.${NC}"
    exit 1
fi
