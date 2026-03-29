#!/bin/bash
set -euo pipefail

# Unify output streams: Docker/Compose can merge stdout/stderr out-of-order.
# Redirect stderr to stdout so log ordering reflects actual execution order.
exec 2>&1

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

TARGETS_FILE="${WRK_TARGETS_FILE:-/workspace/config/benchmark-targets.txt}"
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
  echo "[wrk2] WARN: ${BENCH_DIR} is not writable; using ${fallback} instead"
  BENCH_DIR="${fallback}"
  mkdir -p "${BENCH_DIR}" || true
fi

if [ "${SAVE_LOGS}" = "auto" ]; then
  if can_write_dir "${BENCH_DIR}"; then
    SAVE_LOGS=true
  else
    echo "[wrk2] WARN: ${BENCH_DIR} is not writable; falling back to console-only output (WRK_SAVE_LOGS=false)"
    SAVE_LOGS=false
  fi
fi

if [ "${SAVE_LOGS}" = "true" ] && ! can_write_dir "${BENCH_DIR}"; then
  echo "[wrk2] ERROR: ${BENCH_DIR} is not writable (cannot create benchmark log files)."
  echo "[wrk2] HINT: fix host folder permissions/mount options or set WRK_SAVE_LOGS=false/auto."
  exit 13
fi

EXPORT_ENABLED=false
if [ -n "${EXPORT_DIR}" ]; then
  mkdir -p "${EXPORT_DIR}" 2>/dev/null || true
  # NOTE: some analyzers mis-detect the line below as having a stray ']'.
  if can_write_dir "${EXPORT_DIR}"; then
    EXPORT_ENABLED=true
  else
    echo "[wrk2] WARN: WRK_EXPORT_DIR=${EXPORT_DIR} is set but not writable; exports will be skipped"
  fi
fi

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
    echo "[wrk2] WARN: failed to export ${src_file} -> ${dest_file}"
    return 0
  }

  echo "[wrk2] exported: ${dest_file}"
}

# ========================
# Load benchmark target URLs from the targets file
# ========================

load_targets() {
  if [ ! -f "${TARGETS_FILE}" ]; then
    echo "[wrk2] ERROR: benchmark targets file not found: ${TARGETS_FILE}"
    exit 1
  fi

  local urls=()
  while IFS= read -r line || [ -n "${line}" ]; do
    # Strip leading/trailing whitespace
    line="$(echo "${line}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    # Skip blank lines and comments
    [ -z "${line}" ] && continue
    [[ "${line}" == \#* ]] && continue
    urls+=("${line}")
  done < "${TARGETS_FILE}"

  if [ ${#urls[@]} -eq 0 ]; then
    echo "[wrk2] WARN: no URLs found in ${TARGETS_FILE}"
  fi

  # Return via global array
  BENCHMARK_URLS=("${urls[@]+"${urls[@]}"}")
}

# ========================
# Derive a safe label from a URL for filenames
# ========================

url_label() {
  local url=$1
  # Extract host and path, replace slashes and colons with underscores
  echo "${url}" | sed 's|http://||;s|[/:.]|_|g'
}

# Enhanced run printout:
# - iteration progress: iter X/Y (or X/∞)
# - benchmark within iteration: b X/Y
# - overall benchmark: X/Y (or X/∞)
run_wrk_one() {
  local url=$1
  local iter=$2
  local iter_idx=$3
  local iter_total=$4
  local iter_bench_idx=$5
  local iter_bench_total=$6
  local overall_bench_idx=$7
  local overall_total=$8

  if [ -z "${url}" ]; then
    echo "[wrk2] ERROR: url is empty"
    return 2
  fi

  if [ -z "${RATE}" ]; then
    echo "[wrk2] ERROR: WRK_RATE must be set for wrk2 (-R)."
    return 2
  fi

  local ts
  ts=$(now_time_stamp)

  local label
  label="$(url_label "${url}")"

  local filename
  filename="${ts}__iter${iter}__${label}_${THREADS}_${CONNECTIONS}_${DURATION}_${RATE}.log"

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

echo "[wrk2] benchmark script ready (exec /script/benchmark.sh to run on-demand)"

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

# Load the target URL list from file
load_targets

ITER_BENCH_TOTAL="${#BENCHMARK_URLS[@]}"

if [ "${ITER_BENCH_TOTAL}" -eq 0 ]; then
  echo "[wrk2] no benchmark targets configured; exiting"
  exit 0
fi

echo "[wrk2] loaded ${ITER_BENCH_TOTAL} benchmark target(s) from ${TARGETS_FILE}"

# Totals for progress printout:
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

  for url in "${BENCHMARK_URLS[@]}"; do
    iter_bench_idx=$((iter_bench_idx + 1))
    overall_count=$((overall_count + 1))
    run_wrk_one "${url}" "${count}" "${count}" "${TOTAL_ITER}" "${iter_bench_idx}" "${ITER_BENCH_TOTAL}" "${overall_count}" "${TOTAL_OVERALL}" || true
    if [ "${iter_bench_idx}" -lt "${ITER_BENCH_TOTAL}" ]; then
      echo "[wrk2] sleeping ${SLEEP_BETWEEN}s";
      sleep "${SLEEP_BETWEEN}"
    fi
  done

  # Stop condition:
  # - WRK_ITERATIONS=0 => loop forever
  # - WRK_ITERATIONS>0 => stop when count reaches ITERATIONS
  if [ "${ITERATIONS}" != "0" ] && [ "${count}" -ge "${ITERATIONS}" ]; then
    echo "[wrk2] reached WRK_ITERATIONS=${ITERATIONS}, exiting";
    break
  fi

done