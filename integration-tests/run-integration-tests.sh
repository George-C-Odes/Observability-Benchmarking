#!/usr/bin/env bash
# The stack must already be running. See README.md for prerequisites and filters.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage: bash integration-tests/run-integration-tests.sh [options]
  --services ID[,ID...]   Select exact service IDs from services.txt
  --groups NAME[,NAME...] Select deployment,health,logs,telemetry,stack,wrk2
  --list                 List service IDs and exit
  --help                 Show this help

Default: all services and groups. Health polling is a prerequisite for service
checks. Shared stack/wrk2 groups obey --groups only.
Timeouts (positive integer seconds): REQUEST_TIMEOUT=2, CONNECT_TIMEOUT=2,
STARTUP_TIMEOUT=30, LOG_TIMEOUT=5, TELEMETRY_TIMEOUT=90, DOCKER_TIMEOUT=10.
DOCKER_STARTUP_TIMEOUT=30 bounds the retrying daemon preflight.
POLL_INTERVAL=0.5, OUTPUT_DIR=integration-tests/output, PYTHON=python3.
Existing *_URL and WRK2_CONTAINER_NAME overrides remain supported.
DOCKER_BIN selects the Docker executable (default: docker). In WSL, a missing
default socket can fall back to docker.exe's local Docker Desktop Linux context.
EOF
}

contains() { [[ ",$1," == *",$2,"* ]]; }
group_selected() { contains "$GROUP_FILTER" "$1"; }
service_selected() { [[ -z "$SERVICE_FILTER" ]] || contains "$SERVICE_FILTER" "$1"; }

http_probe() {
    local url=$1 statuses=$2 expected=$3 curl_rc=0
    shift 3
    PROBE_FATAL=false
    : > "$TEMP_DIR/body"
    HTTP_STATUS=$(curl --silent --show-error --connect-timeout "$CONNECT_TIMEOUT" \
        --max-time "${PROBE_TIMEOUT:-$REQUEST_TIMEOUT}" --output "$TEMP_DIR/body" \
        --write-out '%{http_code}' "$@" "$url" 2>"$TEMP_DIR/curl-error") || curl_rc=$?
    HTTP_BODY=$(<"$TEMP_DIR/body")
    if ((curl_rc != 0)); then
        FAIL_REASON="curl exit ${curl_rc} for ${url}: $(<"$TEMP_DIR/curl-error")"
        return 1
    fi
    if ! contains "$statuses" "$HTTP_STATUS"; then
        FAIL_REASON="${url}: expected HTTP ${statuses}, got ${HTTP_STATUS}; body: ${HTTP_BODY:0:1000}"
        case $HTTP_STATUS in 400|401|403|405|422) PROBE_FATAL=true ;; esac
        return 1
    fi
    if [[ $HTTP_BODY != *"$expected"* ]]; then
        FAIL_REASON="${url}: missing literal content '${expected}'; body: ${HTTP_BODY:0:1000}"
        return 1
    fi
    return 0
}

# Remaining deadlines cap each HTTP/Docker attempt as well as the whole poll.
poll_until() {
    local duration=$1 deadline remaining PROBE_TIMEOUT POLL_DEADLINE
    shift
    deadline=$((SECONDS + duration))
    POLL_DEADLINE=$deadline
    TEST_ATTEMPTS=0
    while ((SECONDS < deadline)); do
        TEST_ATTEMPTS=$((TEST_ATTEMPTS + 1))
        PROBE_FATAL=false
        remaining=$((deadline - SECONDS))
        PROBE_TIMEOUT=$REQUEST_TIMEOUT
        ((remaining >= PROBE_TIMEOUT)) || PROBE_TIMEOUT=$remaining
        if "$@"; then return 0; fi
        if [[ $PROBE_FATAL == true ]]; then
            FAIL_REASON="Non-retryable failure: $FAIL_REASON"
            return 1
        fi
        ((SECONDS < deadline)) || break
        remaining=$((deadline - SECONDS))
        ((remaining > 0)) || break
        sleep "$(awk -v interval="$POLL_INTERVAL" -v remaining="$remaining" \
            'BEGIN { print interval < remaining ? interval : remaining }')"
    done
    FAIL_REASON="Timed out after ${duration}s: ${FAIL_REASON:-condition not met}"
    return 1
}

probe_any_health() {
    local base=$1 statuses=$2 paths=$3 path failures=''
    local deadline remaining
    local -a alternatives
    IFS=';' read -r -a alternatives <<< "$paths"
    deadline=${POLL_DEADLINE:-$((SECONDS + REQUEST_TIMEOUT * ${#alternatives[@]}))}
    for path in "${alternatives[@]}"; do
        remaining=$((deadline - SECONDS))
        ((remaining > 0)) || break
        local PROBE_TIMEOUT=$REQUEST_TIMEOUT
        ((remaining >= PROBE_TIMEOUT)) || PROBE_TIMEOUT=$remaining
        if http_probe "${base}${path}" "$statuses" ''; then return 0; fi
        # A missing optional endpoint must not prevent another alternative.
        PROBE_FATAL=false
        failures+="${FAIL_REASON}"$'\n'
    done
    FAIL_REASON=$failures
    return 1
}

docker_capture() {
    local limit=$DOCKER_TIMEOUT rc=0 remaining
    local -a command=("${DOCKER_CLI:-docker}")
    if [[ -n ${DOCKER_FALLBACK_CONTEXT:-} ]]; then command+=(--context "$DOCKER_FALLBACK_CONTEXT"); fi
    if [[ -n ${POLL_DEADLINE:-} ]]; then
        remaining=$((POLL_DEADLINE - SECONDS))
        if ((remaining <= 0)); then FAIL_REASON='Docker polling deadline expired'; return 1; fi
        ((remaining >= limit)) || limit=$remaining
    fi
    # Git Bash must leave container paths such as /wrk2/wrk intact for Docker.
    DOCKER_OUTPUT=$(MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \
        timeout --kill-after=2s "${limit}s" "${command[@]}" "$@" 2>&1 </dev/null) || rc=$?
    # Windows CLI metadata may contain CRLF; never pass a trailing CR to --since.
    DOCKER_OUTPUT=${DOCKER_OUTPUT//$'\r'/}
    if ((rc != 0)); then
        FAIL_REASON="${command[*]} $*: exit ${rc}: ${DOCKER_OUTPUT:0:2000}"
        if ((rc == 124 || rc == 137)); then
            FAIL_REASON+=" (command deadline ${limit}s; Docker may still be starting)"
        elif ((rc == 127)) || [[ ${DOCKER_OUTPUT,,} == *'permission denied'* ]]; then
            PROBE_FATAL=true
        fi
        return 1
    fi
}

is_wsl() {
    [[ -n ${WSL_DISTRO_NAME:-} || -n ${WSL_INTEROP:-} ]] || \
        { [[ -r /proc/sys/kernel/osrelease ]] && [[ $(</proc/sys/kernel/osrelease) == *microsoft* ]]; }
}

try_wsl_docker_desktop() {
    local windows_cli original_cli=${DOCKER_CLI:-docker} native_error=$FAIL_REASON fallback_error
    # Never change an explicitly selected client/host/context or a working client.
    [[ -z ${DOCKER_BIN:-} && -z ${DOCKER_HOST:-} && -z ${DOCKER_CONTEXT:-} ]] || return 1
    is_wsl || return 1
    [[ $native_error == *'unix:///var/run/docker.sock'* && $native_error == *'no such file or directory'* ]] || return 1
    if ! windows_cli=$(command -v docker.exe); then
        FAIL_REASON+=$'\nEnable Docker Desktop > Settings > Resources > WSL Integration for '"${WSL_DISTRO_NAME:-this distro}"'. Alternatively set DOCKER_BIN to the Windows docker.exe path.'
        PROBE_FATAL=true
        return 1
    fi
    DOCKER_CLI=$windows_cli
    # Only auto-select Docker Desktop's local named pipe, never a remote context.
    if docker_capture context inspect desktop-linux --format '{{.Endpoints.docker.Host}}'; then
        if [[ $DOCKER_OUTPUT == npipe://* ]]; then
            DOCKER_FALLBACK_CONTEXT=desktop-linux
            if docker_capture version --format '{{.Server.Version}}'; then
                PROBE_FATAL=false
                printf 'WSL default Docker socket is missing; using Docker Desktop via %s --context desktop-linux\n' "$DOCKER_CLI"
                return 0
            fi
        else
            FAIL_REASON="Docker Desktop context is not a local named pipe: $DOCKER_OUTPUT"
        fi
    fi
    fallback_error=$FAIL_REASON
    DOCKER_CLI=$original_cli; DOCKER_FALLBACK_CONTEXT=''
    FAIL_REASON="$native_error"$'\n'"Windows Docker Desktop fallback failed: $fallback_error"$'\nEnable Docker Desktop > Settings > Resources > WSL Integration for '"${WSL_DISTRO_NAME:-this distro}"'.'
    return 1
}

probe_docker() {
    # version is substantially lighter than collecting the full `docker info`.
    if ! docker_capture version --format '{{.Server.Version}}'; then
        try_wsl_docker_desktop || return 1
    fi
    DOCKER_AVAILABLE=true
    printf 'Docker server: %s; client: %s; context: %s\n' "$DOCKER_OUTPUT" \
        "${DOCKER_CLI:-docker}" "${DOCKER_FALLBACK_CONTEXT:-${DOCKER_CONTEXT:-client default}}"
}

require_docker() {
    if [[ $DOCKER_AVAILABLE != true ]]; then
        FAIL_REASON="Docker unavailable: ${DOCKER_ERROR}"
        return 1
    fi
}

probe_log() {
    local container=$1 since=$2 marker=$3
    docker_capture logs --since "$since" --tail 200 "$container" || return 1
    if [[ ${DOCKER_OUTPUT,,} == *"${marker,,}"* ]]; then return 0; fi
    FAIL_REASON="No new '${marker}' log in ${container} since ${since}; logs: ${DOCKER_OUTPUT:0:2000}"
    return 1
}

test_runtime_log() {
    local url=$1 container=$2 marker=$3 since
    require_docker || return 1
    # The daemon clock avoids host/daemon skew and excludes old matching logs.
    docker_capture info --format '{{.SystemTime}}' || return 1
    since=$DOCKER_OUTPUT
    if [[ $since != ????-??-??T* ]]; then FAIL_REASON="Invalid Docker clock: $since"; return 1; fi
    http_probe "${url}?log=true" 200 "$CONTENT" || return 1
    poll_until "$LOG_TIMEOUT" probe_log "$container" "$since" "$marker"
}

seed_telemetry() {
    local url=$1 ids
    ids=$("$PYTHON" "$SCRIPT_DIR/results.py" ids) || return 1
    read -r TRACE_ID SPAN_ID <<< "$ids"
    TELEMETRY_SINCE=$(date +%s)
    http_probe "${url}?log=true" 200 "$CONTENT" \
        --header "traceparent: 00-${TRACE_ID}-${SPAN_ID}-01"
}

probe_telemetry() {
    local kind=$1 service=$2 since=$3 trace_id=$4 marker=$5 query check_error window
    local -a headers=()
    case $kind in
        mimir)
            # Raw range samples retain metric names and their actual timestamps.
            # timestamp(selector) drops __name__, colliding for identically labeled metrics.
            window=$(( $(date +%s) - since + 1 ))
            ((window > 0)) || window=1
            query="{service_name=\"${service}\"}[${window}s]"
            headers=(--header "X-Scope-OrgID: ${MIMIR_TENANT_ID:-anonymous}")
            http_probe "${MIMIR_URL}/prometheus/api/v1/query" 200 '' --get \
                --data-urlencode "query=${query}" "${headers[@]}" || return 1
            ;;
        loki)
            query="{service_name=\"${service}\"} |= \"${marker}\""
            if [[ -n ${LOKI_TENANT_ID:-} ]]; then headers=(--header "X-Scope-OrgID: $LOKI_TENANT_ID"); fi
            http_probe "${LOKI_URL}/loki/api/v1/query_range" 200 '' --get \
                --data-urlencode "query=${query}" --data-urlencode "start=${since}000000000" \
                --data-urlencode 'limit=20' "${headers[@]}" || return 1
            ;;
        tempo)
            if [[ -n ${TEMPO_TENANT_ID:-} ]]; then headers=(--header "X-Scope-OrgID: $TEMPO_TENANT_ID"); fi
            http_probe "${TEMPO_URL}/api/traces/${trace_id}" 200 '' \
                --header 'Accept: application/json' "${headers[@]}" || return 1
            ;;
    esac
    if check_error=$("$PYTHON" "$SCRIPT_DIR/results.py" check "$kind" "$service" "$since" "$trace_id" \
        <<< "$HTTP_BODY" 2>&1); then return 0; fi
    FAIL_REASON="${kind}: ${check_error}"
    return 1
}

test_wrk() {
    local validation
    require_docker || return 1
    docker_capture exec "${WRK2_CONTAINER_NAME:-wrk2}" /wrk2/wrk -t1 -c1 -d3s -R10 \
        --timeout 2s http://127.0.0.1:3003/ready || return 1
    printf '%s\n' "$DOCKER_OUTPUT"
    if validation=$("$PYTHON" "$SCRIPT_DIR/results.py" wrk <<< "$DOCKER_OUTPUT" 2>&1); then return 0; fi
    FAIL_REASON="${validation}; output: ${DOCKER_OUTPUT:0:2000}"
    return 1
}

# Only run_test records results; fallback attempts never change counters.
run_test() {
    local label=$1 group=$2 service=$3 started=$SECONDS status=passed
    shift 3
    FAIL_REASON=''; TEST_ATTEMPTS=1
    if "$@"; then
        TESTS_PASSED=$((TESTS_PASSED + 1)); LAST_TEST_OK=true
    else
        status=failed; TESTS_FAILED=$((TESTS_FAILED + 1)); LAST_TEST_OK=false
        FAIL_REASON=${FAIL_REASON:-Test command returned nonzero}
    fi
    if [[ $status == passed ]]; then FAIL_REASON=''; fi
    record_result "$label" "$group" "$service" "$status" "$((SECONDS - started))" "$FAIL_REASON"
}

record_result() {
    local label=$1 group=$2 service=$3 status=$4 duration=$5 message=$6
    printf '%s' "$message" | "$PYTHON" "$SCRIPT_DIR/results.py" record \
        "$label" "$group" "$service" "$status" "$duration" "${TEST_ATTEMPTS:-1}" >> "$EVENTS_FILE" || exit 2
    printf '%s%s: %s%s\n' "$BLUE" "$status" "$label" "$NC"
    if [[ -n $message ]]; then printf '  %s\n' "$message"; fi
}

skip_test() {
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
    TEST_ATTEMPTS=0
    record_result "$1" "$2" "$3" skipped 0 "$4"
}

finish() {
    local rc=$? report_rc=0 tee_rc=0
    trap - EXIT
    # Still finish the report if the logging pipe itself has failed.
    set +e
    trap '' PIPE
    printf '\nTests passed: %s; failed: %s; skipped: %s; exit: %s\n' \
        "$TESTS_PASSED" "$TESTS_FAILED" "$TESTS_SKIPPED" "$rc"
    printf '[integration-tests] report: %s\n' "$REPORT_FILE"
    # Close the pipe and wait to drain tee; sync cannot drain a process pipe.
    exec 1>&3 2>&4
    wait "$TEE_PID" || tee_rc=$?
    if ((tee_rc != 0)); then rc=2; fi
    "$PYTHON" "$SCRIPT_DIR/results.py" report "$EVENTS_FILE" "$REPORT_FILE" \
        "$STARTED_AT" "$rc" "$LOG_FILE" "$TEMP_DIR/configuration.json" || report_rc=$?
    rm -rf -- "$TEMP_DIR"
    if ((report_rc != 0 || tee_rc != 0)); then
        printf 'Failed to write report or log (report=%s, tee=%s)\n' "$report_rc" "$tee_rc" >&2
        exit 2
    fi
    exit "$rc"
}

load_versions() {
    local key value
    for key in QUARKUS_VERSION SPRING_BOOT_VERSION MICRONAUT_VERSION HELIDON_VERSION \
        SPARK_VERSION JAVALIN_VERSION DROPWIZARD_VERSION VERTX_VERSION PEKKO_VERSION GO_VERSION DJANGO_VERSION; do
        if ! value=$(awk -v key="$key" '
            $0 ~ "^[[:space:]]*" key "[[:space:]]*:" {
                sub(/^[^:]*:[[:space:]]*/, ""); sub(/[[:space:]]+#.*$/, ""); sub(/[[:space:]]+$/, ""); value=$0
            }
            END { if (value == "") exit 1; print value }
        ' "$SCRIPT_DIR/../compose/.env"); then
            printf 'Missing or empty %s in compose/.env\n' "$key" >&2; return 1
        fi
        printf '%s: %s\n' "$key" "$value"
    done
}

run_services() {
    local row id url_var port codes paths specs base spec path marker first_spec backend ready seeded expected statuses
    local job since trace_id telemetry_count=0
    local -a endpoints telemetry_jobs=()
    for row in "${SERVICES[@]}"; do
        [[ -n $row && $row != \#* ]] || continue
        IFS='|' read -r id url_var port CONTENT codes paths specs <<< "$row"
        service_selected "$id" || continue
        base=${!url_var:-http://localhost:$port}; base=${base%/}
        IFS=';' read -r -a endpoints <<< "$specs"
        run_test "$id health/readiness" health "$id" poll_until "$STARTUP_TIMEOUT" probe_any_health "$base" "$codes" "$paths"
        ready=$LAST_TEST_OK
        for spec in "${endpoints[@]}"; do
            path=${spec%%~*}; marker=${spec#*~}
            if group_selected deployment; then
                expected=''; statuses=$codes
                if [[ $path == /hello/* ]]; then expected=$CONTENT; statuses=200; fi
                if [[ $ready == true ]]; then
                    run_test "$id $path response" deployment "$id" http_probe "$base$path" "$statuses" "$expected"
                else skip_test "$id $path response" deployment "$id" 'Service readiness failed'; fi
            fi
            if group_selected logs && [[ -n $marker ]]; then
                if [[ $DOCKER_AVAILABLE != true ]]; then
                    skip_test "$id $path runtime log" logs "$id" 'Docker preflight failed (see preflight result)'
                elif [[ $ready == true ]]; then
                    run_test "$id $path runtime log" logs "$id" test_runtime_log "$base$path" "$id" "$marker"
                else skip_test "$id $path runtime log" logs "$id" 'Service readiness failed'; fi
            fi
        done
        if group_selected telemetry; then
            first_spec=${endpoints[0]}; path=${first_spec%%~*}; marker=${first_spec#*~}; seeded=false
            if [[ $ready == true ]]; then
                run_test "$id telemetry request" telemetry "$id" seed_telemetry "$base$path"
                seeded=$LAST_TEST_OK
            else skip_test "$id telemetry request" telemetry "$id" 'Service readiness failed'; fi
            if [[ $seeded == true ]]; then
                telemetry_jobs+=("$id|$TELEMETRY_SINCE|$TRACE_ID|$marker")
                telemetry_count=$((telemetry_count + 1))
            else
                for backend in mimir loki tempo; do
                    skip_test "$id $backend ingestion" telemetry "$id" 'Telemetry request prerequisite failed'
                done
            fi
        fi
    done
    # Seed every selected service first so exporter/batch delays overlap.
    if ((telemetry_count > 0)); then
        for job in "${telemetry_jobs[@]}"; do
            IFS='|' read -r id since trace_id marker <<< "$job"
            for backend in mimir loki tempo; do
                run_test "$id $backend ingestion" telemetry "$id" poll_until "$TELEMETRY_TIMEOUT" \
                    probe_telemetry "$backend" "$id" "$since" "$trace_id" "$marker"
            done
        done
    fi
}

run_stack() {
    local id url_var default path base
    while IFS='|' read -r id url_var default path; do
        base=${!url_var:-$default}; base=${base%/}
        run_test "$id readiness" stack "$id" poll_until "$STARTUP_TIMEOUT" http_probe "${base}${path}" 200 ''
    done <<'EOF'
grafana|GRAFANA_URL|http://localhost:3000|/api/health
alloy|ALLOY_URL|http://localhost:12345|/-/ready
loki|LOKI_URL|http://localhost:3100|/ready
mimir|MIMIR_URL|http://localhost:9009|/ready
tempo|TEMPO_URL|http://localhost:3200|/ready
pyroscope|PYROSCOPE_URL|http://localhost:4040|/ready
nextjs-dash|NEXTJS_URL|http://localhost:3001|/api/app-health
orchestrator|ORCHESTRATOR_URL|http://localhost:3002|/q/health/ready
orchestrator-aggregated|ORCHESTRATOR_URL|http://localhost:3002|/v1/health
EOF
}

write_configuration() {
    "$PYTHON" "$SCRIPT_DIR/results.py" configuration \
        "services=${SERVICE_FILTER:-all}" "groups=$GROUP_FILTER" "bash=$BASH_VERSION" \
        "REQUEST_TIMEOUT=$REQUEST_TIMEOUT" "CONNECT_TIMEOUT=$CONNECT_TIMEOUT" "STARTUP_TIMEOUT=$STARTUP_TIMEOUT" \
        "LOG_TIMEOUT=$LOG_TIMEOUT" "TELEMETRY_TIMEOUT=$TELEMETRY_TIMEOUT" "DOCKER_TIMEOUT=$DOCKER_TIMEOUT" \
        "DOCKER_STARTUP_TIMEOUT=$DOCKER_STARTUP_TIMEOUT" "POLL_INTERVAL=$POLL_INTERVAL" \
        "DOCKER_BIN=${DOCKER_BIN:-auto}" "docker_client=$DOCKER_CLI" \
        "docker_context=${DOCKER_FALLBACK_CONTEXT:-${DOCKER_CONTEXT:-client default}}" \
        "DOCKER_HOST=${DOCKER_HOST:-client default}" "WSL_DISTRO_NAME=${WSL_DISTRO_NAME:-}" > "$TEMP_DIR/configuration.json"
}

main() {
    if ((BASH_VERSINFO[0] < 4)); then printf 'Bash 4.0 or newer is required\n' >&2; return 2; fi
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    SERVICE_FILTER=''; GROUP_FILTER=deployment,health,logs,telemetry,stack,wrk2
    mapfile -t SERVICES < "$SCRIPT_DIR/services.txt"
    local arg token row known_ids='' key value
    while (($#)); do
        arg=$1; shift
        case $arg in
            --help|-h) usage; return 0 ;;
            --list) for row in "${SERVICES[@]}"; do [[ -z $row || $row == \#* ]] || printf '%s\n' "${row%%|*}"; done; return 0 ;;
            --services|--groups)
                if (($# == 0)) || [[ -z $1 || $1 == --* ]]; then printf 'Expected value after %s\n' "$arg" >&2; return 2; fi
                if [[ $arg == --services ]]; then SERVICE_FILTER=$1; else GROUP_FILTER=$1; fi
                shift ;;
            *) printf 'Unknown option: %s\n' "$arg" >&2; return 2 ;;
        esac
    done
    for row in "${SERVICES[@]}"; do [[ -z $row || $row == \#* ]] || known_ids+="${row%%|*},"; done
    local -a tokens
    for key in SERVICE_FILTER GROUP_FILTER; do
        value=${!key}
        if [[ $value == ,* || $value == *, || $value == *,,* ]]; then printf 'Invalid filter: %s\n' "$value" >&2; return 2; fi
        IFS=',' read -r -a tokens <<< "$value"
        for token in "${tokens[@]}"; do
            if [[ $key == SERVICE_FILTER ]]; then contains "${known_ids%,}" "$token" && continue
            else contains deployment,health,logs,telemetry,stack,wrk2 "$token" && continue; fi
            printf 'Unknown filter value: %s\n' "$token" >&2; return 2
        done
    done
    REQUEST_TIMEOUT=${REQUEST_TIMEOUT:-2}; CONNECT_TIMEOUT=${CONNECT_TIMEOUT:-2}
    STARTUP_TIMEOUT=${STARTUP_TIMEOUT:-30}; LOG_TIMEOUT=${LOG_TIMEOUT:-5}
    TELEMETRY_TIMEOUT=${TELEMETRY_TIMEOUT:-90}; DOCKER_TIMEOUT=${DOCKER_TIMEOUT:-10}
    DOCKER_STARTUP_TIMEOUT=${DOCKER_STARTUP_TIMEOUT:-30}
    DOCKER_CLI=${DOCKER_BIN:-docker}; DOCKER_FALLBACK_CONTEXT=''
    POLL_INTERVAL=${POLL_INTERVAL:-0.5}; PYTHON=${PYTHON:-python3}
    for key in REQUEST_TIMEOUT CONNECT_TIMEOUT STARTUP_TIMEOUT LOG_TIMEOUT TELEMETRY_TIMEOUT DOCKER_TIMEOUT DOCKER_STARTUP_TIMEOUT; do
        if [[ ! ${!key} =~ ^[1-9][0-9]*$ ]]; then printf '%s must be a positive integer\n' "$key" >&2; return 2; fi
    done
    if group_selected wrk2 && ((DOCKER_TIMEOUT < 5)); then
        printf 'DOCKER_TIMEOUT must be at least 5 seconds for the 3-second wrk2 workload\n' >&2; return 2
    fi
    if [[ ! $POLL_INTERVAL =~ ^([0-9]+)(\.[0-9]+)?$ || ! $POLL_INTERVAL =~ [1-9] ]]; then
        printf 'POLL_INTERVAL must be positive\n' >&2; return 2
    fi
    local tool
    for tool in curl "$PYTHON" awk date mktemp tee sleep timeout; do
        command -v "$tool" >/dev/null || { printf 'Missing required tool: %s\n' "$tool" >&2; return 2; }
    done
    "$PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 9))' || return 2
    [[ -r $SCRIPT_DIR/results.py && -r $SCRIPT_DIR/../compose/.env ]] || return 2
    OUTPUT_DIR=${OUTPUT_DIR:-$SCRIPT_DIR/output}
    mkdir -p "$OUTPUT_DIR"
    TEMP_DIR=$(mktemp -d "$OUTPUT_DIR/.run.XXXXXXXX")
    local run_id
    run_id="$(date -u +%Y%m%d_%H%M%S)_${TEMP_DIR##*.}"
    LOG_FILE=$OUTPUT_DIR/$run_id.log; REPORT_FILE=$OUTPUT_DIR/$run_id.json
    EVENTS_FILE=$TEMP_DIR/events.jsonl; : > "$EVENTS_FILE"; : > "$TEMP_DIR/body"
    STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    TESTS_PASSED=0; TESTS_FAILED=0; TESTS_SKIPPED=0
    DOCKER_AVAILABLE=false; DOCKER_ERROR='Not checked'; FAIL_REASON=''; BLUE=''; NC=''
    if [[ -t 1 && -z ${NO_COLOR:-} ]]; then BLUE=$'\033[0;34m'; NC=$'\033[0m'; fi
    exec 3>&1 4>&2
    exec > >(tee "$LOG_FILE") 2>&1
    TEE_PID=$!
    trap finish EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    printf '[integration-tests] log: %s\nStarted: %s\nHost: %s\nGroups: %s\nServices: %s\n' \
        "$LOG_FILE" "$STARTED_AT" "$(uname -a)" "$GROUP_FILTER" "${SERVICE_FILTER:-all}"
    write_configuration
    printf 'Effective configuration: %s\n' "$(<"$TEMP_DIR/configuration.json")"
    if group_selected telemetry && ((TELEMETRY_TIMEOUT < 10)); then
        printf 'Warning: TELEMETRY_TIMEOUT=%ss may be shorter than exporter and collector batching intervals.\n' "$TELEMETRY_TIMEOUT"
    fi
    load_versions || return 2
    if group_selected logs || group_selected wrk2; then
        run_test 'Docker daemon connectivity' preflight docker poll_until "$DOCKER_STARTUP_TIMEOUT" probe_docker
        if [[ $LAST_TEST_OK != true ]]; then DOCKER_ERROR=$FAIL_REASON; fi
        write_configuration
    fi
    MIMIR_URL=${MIMIR_URL:-http://localhost:9009}; LOKI_URL=${LOKI_URL:-http://localhost:3100}
    TEMPO_URL=${TEMPO_URL:-http://localhost:3200}
    if group_selected stack; then run_stack; fi
    if group_selected deployment || group_selected health || group_selected logs || group_selected telemetry; then run_services; fi
    if group_selected wrk2; then
        run_test 'wrk2 readiness' wrk2 wrk2 poll_until "$STARTUP_TIMEOUT" http_probe "${WRK2_READY_URL:-http://localhost:3003/ready}" 200 ''
        if [[ $DOCKER_AVAILABLE != true ]]; then skip_test 'wrk2 successful requests' wrk2 wrk2 'Docker preflight failed (see preflight result)'
        elif [[ $LAST_TEST_OK == true ]]; then run_test 'wrk2 successful requests' wrk2 wrk2 test_wrk
        else skip_test 'wrk2 successful requests' wrk2 wrk2 'wrk2 readiness failed'; fi
    fi
    ((TESTS_FAILED == 0))
}

# Sourcing exposes functions without starting the suite.
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
