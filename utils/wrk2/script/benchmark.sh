#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${SCRIPT_DIR}/lib.sh"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  emit_benchmark_help
  exit 0
fi

apply_tz

# ========================
# Default Configuration
# ========================
# (defaults are inlined directly below)

HOST="${WRK_HOST:-quarkus-jvm}"
PORT="${WRK_PORT:-8080}"
RESOURCE="${WRK_RESOURCE:-hello}"
ENDPOINT="${WRK_ENDPOINT:-platform}"
THREADS="${WRK_THREADS:-4}"
CONNECTIONS="${WRK_CONNECTIONS:-200}"
DURATION="${WRK_DURATION:-30s}"
RATE="${WRK_RATE:-500}"
SLEEP_BETWEEN="${WRK_SLEEP_BETWEEN:-10}"
SLEEP_INIT="${WRK_SLEEP_INIT:-10}"
ITERATIONS="${WRK_ITERATIONS:-1}"
SAVE_LOGS="${WRK_SAVE_LOGS:-true}"
EXPORT_DIR="${WRK_EXPORT_DIR:-}"

BASE_DIR="${WRK_BENCH_DIR:-/benchmarks}"
DATE_DIR="$(now_date_dir)"
BENCH_DIR="${BASE_DIR}/${DATE_DIR}"

mkdir -p "${BENCH_DIR}" || true

if ! can_write_dir "${BENCH_DIR}"; then
  fallback_base="${WRK_BENCH_FALLBACK_DIR:-/tmp/benchmarks}"
  fallback="${fallback_base}/${DATE_DIR}_uid$(id -u)_$(now_time_stamp)"
  echo "[wrk2] WARN: ${BENCH_DIR} is not writable; using ${fallback} instead" >&2
  BENCH_DIR="${fallback}"
  mkdir -p "${BENCH_DIR}" || true
fi

if [ "${SAVE_LOGS}" = "auto" ]; then
  if can_write_dir "${BENCH_DIR}"; then
    SAVE_LOGS=true
  else
    echo "[wrk2] WARN: ${BENCH_DIR} is not writable; falling back to console-only output (WRK_SAVE_LOGS=false)" >&2
    SAVE_LOGS=false
  fi
fi

if [ "${SAVE_LOGS}" = "true" ] && ! can_write_dir "${BENCH_DIR}"; then
  echo "[wrk2] ERROR: ${BENCH_DIR} is not writable (cannot create benchmark log files)." >&2
  echo "[wrk2] HINT: fix host folder permissions/mount options or set WRK_SAVE_LOGS=false/auto." >&2
  exit 13
fi

EXPORT_ENABLED=false
if [ -n "${EXPORT_DIR}" ]; then
  mkdir -p "${EXPORT_DIR}" 2>/dev/null || true
  # NOTE: some analyzers mis-detect the line below as having a stray ']'.
  if can_write_dir "${EXPORT_DIR}"; then
    EXPORT_ENABLED=true
  else
    echo "[wrk2] WARN: WRK_EXPORT_DIR=${EXPORT_DIR} is set but not writable; exports will be skipped" >&2
  fi
fi

url_for() {
  local target_host=$1
  local target_ep=$2

  if [ -z "${target_ep}" ]; then
    echo "http://${target_host}:${PORT}/${RESOURCE}"
  else
    echo "http://${target_host}:${PORT}/${RESOURCE}/${target_ep}"
  fi
}

export_log() {
  local src_file=$1
  if [ "${EXPORT_ENABLED}" != "true" ]; then
    return 0
  fi
  if [ ! -f "${src_file}" ]; then
    return 0
  fi
  local dest_dir
  dest_dir="${EXPORT_DIR}/$(now_date_dir)"
  mkdir -p "${dest_dir}" 2>/dev/null || true

  local dest_file
  dest_file="${dest_dir}/$(basename "${src_file}")"

  cp -f "${src_file}" "${dest_file}" 2>/dev/null || {
    echo "[wrk2] WARN: failed to export ${src_file} -> ${dest_file}" >&2
    return 0
  }

  echo "[wrk2] exported: ${dest_file}" >&2
}

# Enhanced run printout:
# - iteration progress: iter X/Y (or X/∞)
# - benchmark within iteration: b X/Y
# - overall benchmark: X/Y (or X/∞)
run_wrk_one() {
  local target_host=$1
  local target_ep=$2
  local iter=$3
  local iter_idx=$4
  local iter_total=$5
  local iter_bench_idx=$6
  local iter_bench_total=$7
  local overall_bench_idx=$8
  local overall_total=$9

  if [ -z "${target_host}" ]; then
    echo "[wrk2] ERROR: target_host is empty" >&2
    return 2
  fi

  if [ -z "${RATE}" ]; then
    echo "[wrk2] ERROR: WRK_RATE must be set for wrk2 (-R)." >&2
    return 2
  fi

  local url
  url="$(url_for "${target_host}" "${target_ep}")"

  local ts
  ts=$(now_time_stamp)

  local safe_ep
  safe_ep="${target_ep:-root}"

  local filename
  filename="${ts}__iter${iter}__${target_host}_${safe_ep}_${THREADS}_${CONNECTIONS}_${DURATION}_${RATE}.log"

  local outfile
  outfile="${BENCH_DIR}/${filename}"

  local iter_disp_total="${iter_total}"
  if [ "${iter_total}" = "0" ]; then
    iter_disp_total="∞"
  fi

  local overall_disp_total="${overall_total}"
  if [ "${overall_total}" = "0" ]; then
    overall_disp_total="∞"
  fi

  echo
  echo "[wrk2] Running benchmark ${iter_bench_idx}/${iter_bench_total} of iteration ${iter_idx}/${iter_disp_total}, overall ${overall_bench_idx}/${overall_disp_total}"
  echo "  url:         ${url}"
  echo "  threads:     ${THREADS}"
  echo "  connections: ${CONNECTIONS}"
  echo "  duration:    ${DURATION}"
  echo "  rate:        ${RATE}"
  if [ "${SAVE_LOGS}" = "true" ]; then
    echo "  output:      ${outfile}"
  fi

  local wrk_bin
  wrk_bin="${WRK_BIN:-/wrk2/wrk}"

  if [ "${SAVE_LOGS}" = "true" ]; then
    "${wrk_bin}" -t"${THREADS}" -c"${CONNECTIONS}" -d"${DURATION}" -R"${RATE}" --timeout 10s "${url}" 2>&1 | tee "${outfile}"
    export_log "${outfile}"
  else
    "${wrk_bin}" -t"${THREADS}" -c"${CONNECTIONS}" -d"${DURATION}" -R"${RATE}" --timeout 10s "${url}" 2>&1
  fi
}

# ========================
# Main
# ========================

echo "[wrk2] benchmark script ready (exec /script/benchmark.sh to run on-demand)" >&2

# Avoid printing config twice when WRK_AUTORUN=true:
# - entrypoint.sh prints config once on container boot
# - benchmark.sh prints config only when run on-demand (WRK_PRINT_CONFIG=true)
if [ "${WRK_PRINT_CONFIG:-false}" = "true" ]; then
  print_common_vars summary
fi

if [ "${SLEEP_INIT}" != "0" ] && [ -n "${SLEEP_INIT}" ]; then
  echo "[wrk2] initial sleep: ${SLEEP_INIT}s";
  sleep "${SLEEP_INIT}"
fi

# Determine how many benchmarks in each iteration.
benchmarks_per_iteration() {
  # Count how many run_wrk_one() calls happen in one iteration given the current HOST/ENDPOINT mode.
  if [ "${HOST}" = "combo" ]; then
    echo 17
    return 0
  fi

  if [ "${ENDPOINT}" = "combo" ]; then
    if [[ "${HOST}" == spring-jvm* || "${HOST}" == spring-native* ]]; then
      echo 3
      return 0
    fi
    if [[ "${HOST}" == spark-jvm* || "${HOST}" == javalin-jvm* ]]; then
      echo 2
      return 0
    fi
    if [ "${HOST}" = "go" ]; then
      echo 1
      return 0
    fi
    echo 3
    return 0
  fi

  echo 1
}

ITER_BENCH_TOTAL="$(benchmarks_per_iteration)"

# Totals for progress printout:
# - If WRK_ITERATIONS != 0, we know the total iterations and therefore the overall benchmark count.
# - If WRK_ITERATIONS == 0, totals are infinite (script loops forever).
TOTAL_ITER="${ITERATIONS}"
TOTAL_OVERALL=0
if [ "${ITERATIONS}" != "0" ]; then
  TOTAL_OVERALL=$((ITERATIONS * ITER_BENCH_TOTAL))
fi

count=0
overall_count=0
while true; do
  count=$((count + 1))

  iter_bench_idx=0

  if [ "${HOST}" = "combo" ]; then
    hosts=(
      "spring-jvm-tomcat-platform"
      "spring-jvm-tomcat-virtual"
      "spring-jvm-netty"
      "spring-native-tomcat-platform"
      "spring-native-tomcat-virtual"
      "spring-native-netty"
      "quarkus-jvm"
      "quarkus-jvm"
      "quarkus-jvm"
      "quarkus-native"
      "quarkus-native"
      "quarkus-native"
      "spark-jvm-platform"
      "spark-jvm-virtual"
      "javalin-jvm-platform"
      "javalin-jvm-virtual"
      "go"
    )
    endpoints=(
      "platform"
      "virtual"
      "reactive"
      "platform"
      "virtual"
      "reactive"
      "platform"
      "virtual"
      "reactive"
      "platform"
      "virtual"
      "reactive"
      "platform"
      "virtual"
      "platform"
      "virtual"
      "virtual"
    )
    for i in "${!hosts[@]}"; do
      iter_bench_idx=$((iter_bench_idx + 1))
      overall_count=$((overall_count + 1))
      run_wrk_one "${hosts[$i]}" "${endpoints[$i]}" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
      echo "[wrk2] sleeping ${SLEEP_BETWEEN}s";
      sleep "${SLEEP_BETWEEN}"
    done
  elif [ "${ENDPOINT}" = "combo" ]; then
    if [[ "${HOST}" == spring-jvm* || "${HOST}" == spring-native* || "${HOST}" == spark-jvm* || "${HOST}" == javalin-jvm* ]]; then
      if [[ "${HOST}" == spring-jvm* ]]; then
        hosts=(
          "spring-jvm-tomcat-platform"
          "spring-jvm-tomcat-virtual"
          "spring-jvm-netty"
        )
        endpoints=("platform" "virtual" "reactive")
      elif [[ "${HOST}" == spring-native* ]]; then
        hosts=(
          "spring-native-tomcat-platform"
          "spring-native-tomcat-virtual"
          "spring-native-netty"
        )
        endpoints=("platform" "virtual" "reactive")
      elif [[ "${HOST}" == spark-jvm* ]]; then
        hosts=(
          "spark-jvm-platform"
          "spark-jvm-virtual"
        )
        endpoints=("platform" "virtual")
      elif [[ "${HOST}" == javalin-jvm* ]]; then
        hosts=(
          "javalin-jvm-platform"
          "javalin-jvm-virtual"
        )
        endpoints=("platform" "virtual")
      else
        exit 0
      fi
      for i in "${!hosts[@]}"; do
        iter_bench_idx=$((iter_bench_idx + 1))
        overall_count=$((overall_count + 1))
        run_wrk_one "${hosts[$i]}" "${endpoints[$i]}" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
        echo "[wrk2] sleeping ${SLEEP_BETWEEN}s";
        sleep "${SLEEP_BETWEEN}"
      done
    elif [ "${HOST}" = "go" ]; then
      iter_bench_idx=$((iter_bench_idx + 1))
      overall_count=$((overall_count + 1))
      run_wrk_one "${HOST}" "virtual" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
    else
      for combo_ep in platform virtual reactive; do
        iter_bench_idx=$((iter_bench_idx + 1))
        overall_count=$((overall_count + 1))
        run_wrk_one "${HOST}" "${combo_ep}" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
        echo "[wrk2] sleeping ${SLEEP_BETWEEN}s";
        sleep "${SLEEP_BETWEEN}"
      done
    fi
  else
    iter_bench_idx=$((iter_bench_idx + 1))
    overall_count=$((overall_count + 1))
    run_wrk_one "${HOST}" "${ENDPOINT}" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
  fi

  # Stop condition:
  # - WRK_ITERATIONS=0 => loop forever
  # - WRK_ITERATIONS>0 => stop when count reaches ITERATIONS
  if [ "${ITERATIONS}" != "0" ] && [ "${count}" -ge "${ITERATIONS}" ]; then
    echo "[wrk2] reached WRK_ITERATIONS=${ITERATIONS}, exiting";
    break
  fi

done

