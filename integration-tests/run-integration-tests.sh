#!/usr/bin/env bash
# Integration Test Runner
# Validates deployment and observability for all services (JVM and Native)

set -euo pipefail

# --- Output logging (tee to file) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"
mkdir -p "${OUTPUT_DIR}"
LOG_FILE="${OUTPUT_DIR}/$(date +'%Y%m%d_%H%M%S').log"

# Tee all output (stdout+stderr) to the log file.
# Use a grouped command so failures in tee don't terminate the script under pipefail.
{ exec > >(tee -a "${LOG_FILE}") 2>&1; } || true

echo "[integration-tests] logging to: ${LOG_FILE}"

# --- Host/environment header (helps compare runs) ---
echo ""
echo "=========================================="
echo "Run Environment"
echo "=========================================="
echo "Host OS: $(uname -a 2>/dev/null || echo 'unknown')"

echo "Terminal / session:"
if [ -t 0 ]; then echo "  stdin:  TTY"; else echo "  stdin:  not a TTY"; fi
if [ -t 1 ]; then echo "  stdout: TTY"; else echo "  stdout: not a TTY"; fi
if [ -t 2 ]; then echo "  stderr: TTY"; else echo "  stderr: not a TTY"; fi
if [ -n "${TERM-}" ]; then echo "  TERM:   ${TERM}"; else echo "  TERM:   <not set>"; fi
if [ -n "${SHELL-}" ]; then echo "  SHELL:  ${SHELL}"; else echo "  SHELL:  <not set>"; fi
if [ -n "${0-}" ]; then echo "  argv0:  ${0}"; fi
if [ -n "${USER-}" ]; then echo "  USER:   ${USER}"; fi
if [ -n "${LOGNAME-}" ]; then echo "  LOGNAME:${LOGNAME}"; fi
if [ -n "${WSL_DISTRO_NAME-}" ]; then echo "  WSL:    ${WSL_DISTRO_NAME}"; fi
if [ -n "${WT_SESSION-}" ]; then echo "  WT_SESSION: ${WT_SESSION}"; fi

echo "Timestamp (host): $(date -Iseconds)"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

TIMEOUT=2

# Run a single test command but never abort the suite (set -e safe)
run_test() {
    local label="$1"
    shift

    # Run the test; if it fails, swallow the non-zero to keep suite running.
    if "$@"; then
        return 0
    fi

    echo -e "${RED}[integration-tests] test failed:${NC} ${label}" >&2
    return 0
}

# Configuration - Port mappings match docker-compose.yml order
# JVM Services
SPRING_JVM_TOMCAT_PLATFORM_URL="${SPRING_JVM_TOMCAT_PLATFORM_URL:-http://localhost:8080}"
SPRING_JVM_TOMCAT_VIRTUAL_URL="${SPRING_JVM_TOMCAT_VIRTUAL_URL:-http://localhost:8081}"
SPRING_JVM_NETTY_URL="${SPRING_JVM_NETTY_URL:-http://localhost:8082}"

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
ALLOY_URL="${ALLOY_URL:-http://localhost:12345}"
LOKI_URL="${LOKI_URL:-http://localhost:3100}"
MIMIR_URL="${MIMIR_URL:-http://localhost:9009}"
TEMPO_URL="${TEMPO_URL:-http://localhost:3200}"
PYROSCOPE_URL="${PYROSCOPE_URL:-http://localhost:4040}"
NEXTJS_URL="${NEXTJS_URL:-http://localhost:3001}"
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:3002}"

# Framework versions
QUARKUS_VERSION="3.30.6"
SPRING_BOOT_VERSION="4.0.1"
GO_VERSION="1.25.6"

# Helper function to test HTTP endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local expected_content=${4-}

    echo -n "Testing ${name}... "

    # Don't exit on curl failure
    response=$(curl -s --max-time ${TIMEOUT} -w "\n%{http_code}" "${url}" 2>/dev/null || echo -e "\n000")
    http_code=$(echo "${response}" | tail -n1)
    body=$(echo "${response}" | head -n-1)

    if [ "${http_code}" = "${expected_status}" ]; then
        if [ -z "${expected_content}" ] || echo "${body}" | grep -q "${expected_content}"; then
            echo -e "${GREEN}✓ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} - Expected content '${expected_content}' not found"
            echo "  Response: ${body}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}✗ FAILED${NC} - Expected status ${expected_status}, got ${http_code}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Wait for an endpoint to become ready (polls until success or timeout)
wait_for_endpoint() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    local timeout_seconds=${4:-30}

    echo -n "Waiting for ${name} to be ready... "

    local start_ts
    start_ts=$(date +%s)

    while true; do
        response=$(curl -s --max-time ${TIMEOUT} -w "\n%{http_code}" "${url}" 2>/dev/null || echo -e "\n000")
        http_code=$(echo "${response}" | tail -n1)

        if [ "${http_code}" = "${expected_status}" ]; then
            echo -e "${GREEN}✓ READY${NC}"
            return 0
        fi

        now_ts=$(date +%s)
        if [ $((now_ts - start_ts)) -ge "${timeout_seconds}" ]; then
            echo -e "${RED}✗ TIMEOUT${NC} (last status ${http_code})"
            return 1
        fi

        sleep 0.5
    done
}

# Helper functions to test metrics endpoint
test_spring_metrics() {
    local name=$1
    local url=$2

    # Try different metric endpoints
    test_endpoint "${name} Metrics" "${url}/actuator/metrics" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/actuator/health/readiness" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/actuator/health/liveness" 200 ""
}

test_quarkus_metrics() {
    local name=$1
    local url=$2

    # Try different metric endpoints
    test_endpoint "${name} Metrics" "${url}/q/metrics/json" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/q/health/ready" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/q/health/live" 200 ""
}

test_go_metrics() {
    local name=$1
    local url=$2

    # Try different metric endpoints
    test_endpoint "${name} Metrics" "${url}/healthz" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/readyz" 200 "" || \
    test_endpoint "${name} Metrics" "${url}/livez" 200 ""
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
run_test "Spring Tomcat Platform - /hello/platform" test_endpoint "Spring Tomcat Platform - /hello/platform" "${SPRING_JVM_TOMCAT_PLATFORM_URL}/hello/platform" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot JVM Tomcat Virtual (port 8081) ---${NC}"
run_test "Spring Tomcat Virtual - /hello/virtual" test_endpoint "Spring Tomcat Virtual - /hello/virtual" "${SPRING_JVM_TOMCAT_VIRTUAL_URL}/hello/virtual" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot JVM Netty (port 8082) ---${NC}"
run_test "Spring Netty - /hello/reactive" test_endpoint "Spring Netty - /hello/reactive" "${SPRING_JVM_NETTY_URL}/hello/reactive" 200 "Boot"
echo ""

echo -e "${BLUE}--- Quarkus JVM (port 8086) ---${NC}"
run_test "Quarkus JVM - /hello/platform" test_endpoint "Quarkus JVM - /hello/platform" "${QUARKUS_JVM_URL}/hello/platform" 200 "Quarkus"
run_test "Quarkus JVM - /hello/virtual" test_endpoint "Quarkus JVM - /hello/virtual" "${QUARKUS_JVM_URL}/hello/virtual" 200 "Quarkus"
run_test "Quarkus JVM - /hello/reactive" test_endpoint "Quarkus JVM - /hello/reactive" "${QUARKUS_JVM_URL}/hello/reactive" 200 "Quarkus"
echo ""

echo "=========================================="
echo "Native Services - Deployment Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Spring Boot Native Tomcat Platform (port 8083) ---${NC}"
run_test "Spring Native Tomcat Platform - /hello/platform" test_endpoint "Spring Native Tomcat Platform - /hello/platform" "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}/hello/platform" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot Native Tomcat Virtual (port 8084) ---${NC}"
run_test "Spring Native Tomcat Virtual - /hello/virtual" test_endpoint "Spring Native Tomcat Virtual - /hello/virtual" "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}/hello/virtual" 200 "Boot"
echo ""

echo -e "${BLUE}--- Spring Boot Native Netty (port 8085) ---${NC}"
run_test "Spring Native Netty - /hello/reactive" test_endpoint "Spring Native Netty - /hello/reactive" "${SPRING_NATIVE_NETTY_URL}/hello/reactive" 200 "Boot"
echo ""

echo -e "${BLUE}--- Quarkus Native (port 8087) ---${NC}"
run_test "Quarkus Native - /hello/platform" test_endpoint "Quarkus Native - /hello/platform" "${QUARKUS_NATIVE_URL}/hello/platform" 200 "Quarkus"
run_test "Quarkus Native - /hello/virtual" test_endpoint "Quarkus Native - /hello/virtual" "${QUARKUS_NATIVE_URL}/hello/virtual" 200 "Quarkus"
run_test "Quarkus Native - /hello/reactive" test_endpoint "Quarkus Native - /hello/reactive" "${QUARKUS_NATIVE_URL}/hello/reactive" 200 "Quarkus"
echo ""

echo "=========================================="
echo "Go Service - Deployment Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Go Fiber (port 8088) ---${NC}"
run_test "Go - /hello/virtual" test_endpoint "Go - /hello/virtual" "${GO_URL}/hello/virtual" 200 "GO"
echo ""

echo "=========================================="
echo "Observability Mechanism Tests"
echo "=========================================="
echo ""

echo -e "${BLUE}--- Metrics Collection ---${NC}"
run_test "Spring Tomcat Platform metrics" test_spring_metrics "Spring Tomcat Platform" "${SPRING_JVM_TOMCAT_PLATFORM_URL}"
run_test "Spring Tomcat Virtual metrics" test_spring_metrics "Spring Tomcat Virtual" "${SPRING_JVM_TOMCAT_VIRTUAL_URL}"
run_test "Spring Netty metrics" test_spring_metrics "Spring Netty" "${SPRING_JVM_NETTY_URL}"
run_test "Spring Native Tomcat Platform metrics" test_spring_metrics "Spring Native Tomcat Platform" "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}"
run_test "Spring Native Tomcat Virtual metrics" test_spring_metrics "Spring Native Tomcat Virtual" "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}"
run_test "Spring Native Netty metrics" test_spring_metrics "Spring Native Netty" "${SPRING_NATIVE_NETTY_URL}"
run_test "Quarkus JVM metrics" test_quarkus_metrics "Quarkus JVM" "${QUARKUS_JVM_URL}"
run_test "Quarkus Native metrics" test_quarkus_metrics "Quarkus Native" "${QUARKUS_NATIVE_URL}"
run_test "Go metrics" test_go_metrics "Go" "${GO_URL}"
echo ""

echo -e "${BLUE}--- Grafana Stack Readiness ---${NC}"
run_test "Grafana UI" test_endpoint "Grafana UI" "${GRAFANA_URL}/api/health" 200 ""
run_test "Alloy" test_endpoint "Alloy" "${ALLOY_URL}/-/ready" 200 ""
run_test "Loki" test_endpoint "Loki" "${LOKI_URL}/ready" 200 ""
run_test "Mimir" test_endpoint "Mimir" "${MIMIR_URL}/ready" 200 ""
run_test "Tempo" test_endpoint "Tempo" "${TEMPO_URL}/ready" 200 ""
run_test "Pyroscope" test_endpoint "Pyroscope" "${PYROSCOPE_URL}/ready" 200 ""
echo ""

echo -e "${BLUE}--- Orchestration Stack Readiness ---${NC}"
run_test "NextJS UI" test_endpoint "NextJS UI" "${NEXTJS_URL}/api/app-health" 200 ""
run_test "Orchestrator" test_endpoint "Orchestrator" "${ORCHESTRATOR_URL}/q/health/ready" 200 ""
run_test "Orchestrator Aggregated" test_endpoint "Orchestrator Aggregated" "${ORCHESTRATOR_URL}/v1/health" 200 ""

# --- wrk2 readiness + on-demand exec smoke test ---
# We assume containers are already up; this verifies wrk2 is serving /ready and that on-demand exec works.
echo ""
echo -e "${BLUE}--- wrk2 Readiness + On-demand Exec ---${NC}"

WRK2_READY_URL="${WRK2_READY_URL:-http://localhost:3003/ready}"
WRK2_CONTAINER_NAME="${WRK2_CONTAINER_NAME:-wrk2}"

if wait_for_endpoint "wrk2 (/ready)" "${WRK2_READY_URL}" 200 30; then
    echo "wrk2 exec self-ready check (printing wrk output below):"

    # Run wrk2 against its own readiness endpoint from inside the container.
    # We must also verify output contains "Transfer/sec" (ensures the command actually ran).
    WRK_EXEC_OUT=""
    if WRK_EXEC_OUT="$(docker exec "${WRK2_CONTAINER_NAME}" /wrk2/wrk -t1 -c1 -d1s -R1 --timeout 3s http://0.0.0.0:3003/ready 2>&1)"; then
        echo "----- wrk2 exec output (begin) -----"
        echo "${WRK_EXEC_OUT}"
        echo "----- wrk2 exec output (end) -----"

        # Sometimes output arrives slightly delayed in terminals/streams. Be tolerant up to 2s.
        deadline=$((SECONDS + 2))
        while ! echo "${WRK_EXEC_OUT}" | grep -q "Transfer/sec"; do
            [ ${SECONDS} -ge ${deadline} ] && break
            sleep 0.2
        done

        if echo "${WRK_EXEC_OUT}" | grep -q "Transfer/sec"; then
            echo -e "${GREEN}✓ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "  wrk2 exec completed but expected output 'Transfer/sec' was not found within 2s."
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        echo "----- wrk2 exec output (begin) -----"
        echo "${WRK_EXEC_OUT}"
        echo "----- wrk2 exec output (end) -----"
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Could not run on-demand wrk2 self-ready check inside container '${WRK2_CONTAINER_NAME}'."
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${RED}✗ FAILED${NC} - wrk2 readiness endpoint was not ready at ${WRK2_READY_URL}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""

echo -e "${BLUE}--- Trace Generation (Smoke Test) ---${NC}"
echo "Generating request to create trace and verify container log output..."

# Verify last log line contains expected substring (case-insensitive)
verify_last_log_contains() {
    local container_name="$1"
    local expected="$2"
    local label="$3"

    echo -n "Trace log check ${label} (${container_name})... "

    # Get last log line (don't fail the whole script if container/logs are unavailable)
    local last_line
    last_line="$(docker logs --tail 1 "${container_name}" 2>/dev/null || true)"

    if echo "${last_line}" | grep -qi "${expected}"; then
        echo -e "${GREEN}✓ PASSED${NC} (found '${expected}')"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (missing '${expected}')"
        echo "  Last log line: ${last_line:-<empty>}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Run request then verify logs
run_trace_and_verify() {
    local label="$1"
    local url="$2"
    local container_name="$3"
    local expected="$4"

    # Fire request to generate log/trace (don't fail suite on curl failure)
    curl -s --max-time ${TIMEOUT} "${url}?log=true" > /dev/null 2>&1 || true

    # Small delay to let the service flush logs
    sleep 0.2

    verify_last_log_contains "${container_name}" "${expected}" "${label}"
}

run_test "Trace Spring JVM Tomcat Platform" run_trace_and_verify "Spring JVM Tomcat Platform" "${SPRING_JVM_TOMCAT_PLATFORM_URL}/hello/platform" "spring-jvm-tomcat-platform" "http-nio"
run_test "Trace Spring JVM Tomcat Virtual" run_trace_and_verify "Spring JVM Tomcat Virtual" "${SPRING_JVM_TOMCAT_VIRTUAL_URL}/hello/virtual" "spring-jvm-tomcat-virtual" "VirtualThread"
run_test "Trace Spring JVM Netty Reactive" run_trace_and_verify "Spring JVM Netty Reactive" "${SPRING_JVM_NETTY_URL}/hello/reactive" "spring-jvm-netty" "reactor-http"

run_test "Trace Spring Native Tomcat Platform" run_trace_and_verify "Spring Native Tomcat Platform" "${SPRING_NATIVE_TOMCAT_PLATFORM_URL}/hello/platform" "spring-native-tomcat-platform" "http-nio"
run_test "Trace Spring Native Tomcat Virtual" run_trace_and_verify "Spring Native Tomcat Virtual" "${SPRING_NATIVE_TOMCAT_VIRTUAL_URL}/hello/virtual" "spring-native-tomcat-virtual" "VirtualThread"
run_test "Trace Spring Native Netty Reactive" run_trace_and_verify "Spring Native Netty Reactive" "${SPRING_NATIVE_NETTY_URL}/hello/reactive" "spring-native-netty" "reactor-http"

run_test "Trace Quarkus JVM Platform" run_trace_and_verify "Quarkus JVM Platform" "${QUARKUS_JVM_URL}/hello/platform" "quarkus-jvm" "executor-thread"
run_test "Trace Quarkus JVM Virtual" run_trace_and_verify "Quarkus JVM Virtual" "${QUARKUS_JVM_URL}/hello/virtual"  "quarkus-jvm" "vthread"
run_test "Trace Quarkus JVM Reactive" run_trace_and_verify "Quarkus JVM Reactive" "${QUARKUS_JVM_URL}/hello/reactive" "quarkus-jvm" "vert.x-eventloop-thread"

run_test "Trace Quarkus Native Platform" run_trace_and_verify "Quarkus Native Platform" "${QUARKUS_NATIVE_URL}/hello/platform" "quarkus-native" "executor-thread"
run_test "Trace Quarkus Native Virtual" run_trace_and_verify "Quarkus Native Virtual" "${QUARKUS_NATIVE_URL}/hello/virtual" "quarkus-native" "vthread"
run_test "Trace Quarkus Native Reactive" run_trace_and_verify "Quarkus Native Reactive" "${QUARKUS_NATIVE_URL}/hello/reactive" "quarkus-native" "vert.x-eventloop-thread"

run_test "Trace Go Virtual" run_trace_and_verify "Go Virtual" "${GO_URL}/hello/virtual" "go" "goroutine"

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
    echo "2. Navigate to Drilldown"
    echo "3. View Metrics [Mimir]"
    echo "4. View Logs [Loki]"
    echo "5. View Traces [Tempo]"
    echo "6. View Profiles [Pyroscope]"

    # Ensure the end of suite is clearly visible in logs even when stdout isn't a TTY.
    echo ""
    echo "[integration-tests] suite finished successfully"
    sync 2>/dev/null || true
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please check the output above.${NC}"
    echo ""
    echo "[integration-tests] suite finished with failures"
    sync 2>/dev/null || true
    exit 1
fi
