#!/bin/bash
set -euo pipefail

# Shared helpers for wrk2 scripts.

apply_tz() {
  local tz_val="${TZ:-}"
  if [ -z "${tz_val}" ]; then
    return 0
  fi

  local zonefile="/usr/share/zoneinfo/${tz_val}"
  if [ -f "${zonefile}" ]; then
    ln -snf "${zonefile}" /etc/localtime 2>/dev/null || true
    echo "${tz_val}" > /etc/timezone 2>/dev/null || true
  else
    echo "[wrk2] WARN: TZ='${tz_val}' not found under /usr/share/zoneinfo; using default timezone" >&2
  fi
}

can_write_dir() {
  local dir=$1
  local probe="${dir}/.wrk2_write_test_$$"
  (umask 022; : >"${probe}") 2>/dev/null && rm -f "${probe}" 2>/dev/null
}

now_date_dir() {
  date +'%Y%m%d'
}

now_time_stamp() {
  date +"%H%M%S"
}

bool_is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

# Print the "common variables" list (same order used by benchmark.sh) with defaults and current values.
# Args:
#   1: mode = help|summary
# Notes:
#   - Uses defaults as documented in benchmark.sh.
#   - Current values are taken from the environment (or default if unset).
print_common_vars() {
  local mode="${1:-summary}"

  # Keep these defaults in sync with benchmark.sh
  local DEFAULT_HOST="quarkus-jvm"
  local DEFAULT_PORT="8080"
  local DEFAULT_ENDPOINT="platform"

  local DEFAULT_AUTO_RUN="true"
  local DEFAULT_ITERATIONS="0"
  local DEFAULT_SLEEP_BETWEEN="10"
  local DEFAULT_SLEEP_INIT="0"

  local DEFAULT_THREADS="4"
  local DEFAULT_CONNECTIONS="200"
  local DEFAULT_DURATION="30s"
  local DEFAULT_RATE="500"

  local DEFAULT_SAVE_LOGS="true"
  local DEFAULT_BENCH_DIR="/benchmarks"
  local DEFAULT_EXPORT_DIR=""

  local tz_val="${TZ:-}"
  local host_val="${WRK_HOST:-$DEFAULT_HOST}"
  local port_val="${WRK_PORT:-$DEFAULT_PORT}"
  local ep_val="${WRK_ENDPOINT:-$DEFAULT_ENDPOINT}"

  local auto_val="${WRK_AUTO_RUN:-$DEFAULT_AUTO_RUN}"
  local iter_val="${WRK_ITERATIONS:-$DEFAULT_ITERATIONS}"
  local sleep_between_val="${WRK_SLEEP_BETWEEN:-$DEFAULT_SLEEP_BETWEEN}"
  local sleep_init_val="${WRK_SLEEP_INIT:-$DEFAULT_SLEEP_INIT}"

  local threads_val="${WRK_THREADS:-$DEFAULT_THREADS}"
  local conns_val="${WRK_CONNECTIONS:-$DEFAULT_CONNECTIONS}"
  local dur_val="${WRK_DURATION:-$DEFAULT_DURATION}"
  local rate_val="${WRK_RATE:-$DEFAULT_RATE}"

  local save_logs_val="${WRK_SAVE_LOGS:-$DEFAULT_SAVE_LOGS}"
  local bench_dir_val="${WRK_BENCH_DIR:-$DEFAULT_BENCH_DIR}"
  local export_dir_val="${WRK_EXPORT_DIR:-$DEFAULT_EXPORT_DIR}"

  if [ "${mode}" = "help" ]; then
    # Use literal text (single-quoted heredoc) to avoid unwanted interpolation.
    # Some terminals/renderers may strip '|' characters; we use commas for enums here.
    cat <<'EOF'
Common variables:
  TZ                   Timezone name (e.g. Europe/Nicosia)
  WRK_HOST             Target service hostname
  WRK_PORT             Target port
  WRK_ENDPOINT         hello endpoint suffix (platform, virtual, reactive, combo)

  WRK_AUTO_RUN         true/false: auto-run benchmarks on container start
  WRK_ITERATIONS       number of iterations (0 = loop forever)
  WRK_SLEEP_BETWEEN    delay between runs in seconds
  WRK_SLEEP_INIT       initial delay in seconds

  WRK_THREADS          wrk threads
  WRK_CONNECTIONS      wrk connections
  WRK_DURATION         duration (e.g. 30s, 3m)
  WRK_RATE             target request rate

  WRK_SAVE_LOGS        true, false, auto
  WRK_BENCH_DIR        internal bench dir
  WRK_EXPORT_DIR       host-export dir. When set and writable, each log is copied to:
                       ${WRK_EXPORT_DIR}/YYYYMMDD/<same_filename>
EOF

    cat <<EOF

Defaults and current values:
  TZ                   current:${tz_val:-<unset>}
  WRK_HOST             current:${host_val}, default:${DEFAULT_HOST}
  WRK_PORT             current:${port_val}, default:${DEFAULT_PORT}
  WRK_ENDPOINT         current:${ep_val}, default:${DEFAULT_ENDPOINT}

  WRK_AUTO_RUN         current:${auto_val}, default:${DEFAULT_AUTO_RUN}
  WRK_ITERATIONS       current:${iter_val}, default:${DEFAULT_ITERATIONS}
  WRK_SLEEP_BETWEEN    current:${sleep_between_val}, default:${DEFAULT_SLEEP_BETWEEN}
  WRK_SLEEP_INIT       current:${sleep_init_val}, default:${DEFAULT_SLEEP_INIT}

  WRK_THREADS          current:${threads_val}, default:${DEFAULT_THREADS}
  WRK_CONNECTIONS      current:${conns_val}, default:${DEFAULT_CONNECTIONS}
  WRK_DURATION         current:${dur_val}, default:${DEFAULT_DURATION}
  WRK_RATE             current:${rate_val}, default:${DEFAULT_RATE}

  WRK_SAVE_LOGS        current:${save_logs_val}, default:${DEFAULT_SAVE_LOGS}
  WRK_BENCH_DIR        current:${bench_dir_val}, default:${DEFAULT_BENCH_DIR}
  WRK_EXPORT_DIR       current:${export_dir_val:-<unset>}, default:<empty>
EOF

    return 0
  fi

  # summary (for startup)
  echo "[wrk2] config:" >&2
  echo "  TZ:${tz_val:-<unset>}" >&2
  echo "  WRK_HOST:           ${host_val} (default: ${DEFAULT_HOST})" >&2
  echo "  WRK_PORT:           ${port_val} (default: ${DEFAULT_PORT})" >&2
  echo "  WRK_ENDPOINT:       ${ep_val} (default: ${DEFAULT_ENDPOINT})" >&2
  echo "  WRK_AUTO_RUN:       ${auto_val} (default: ${DEFAULT_AUTO_RUN})" >&2
  echo "  WRK_ITERATIONS:     ${iter_val} (default: ${DEFAULT_ITERATIONS})" >&2
  echo "  WRK_SLEEP_BETWEEN:  ${sleep_between_val} (default: ${DEFAULT_SLEEP_BETWEEN})" >&2
  echo "  WRK_SLEEP_INIT:     ${sleep_init_val} (default: ${DEFAULT_SLEEP_INIT})" >&2
  echo "  WRK_THREADS:        ${threads_val} (default: ${DEFAULT_THREADS})" >&2
  echo "  WRK_CONNECTIONS:    ${conns_val} (default: ${DEFAULT_CONNECTIONS})" >&2
  echo "  WRK_DURATION:       ${dur_val} (default: ${DEFAULT_DURATION})" >&2
  echo "  WRK_RATE:           ${rate_val} (default: ${DEFAULT_RATE})" >&2
  echo "  WRK_SAVE_LOGS:      ${save_logs_val} (default: ${DEFAULT_SAVE_LOGS})" >&2
  echo "  WRK_BENCH_DIR:      ${bench_dir_val} (default: ${DEFAULT_BENCH_DIR})" >&2
  echo "  WRK_EXPORT_DIR:     ${export_dir_val:-<unset>} (default: <empty>)" >&2
}

emit_benchmark_help() {
  cat <<'EOF'
wrk2 benchmark runner

Usage:
  /script/benchmark.sh
  /script/benchmark.sh --help
EOF
  print_common_vars help
  cat <<'EOF'

On-demand usage (container already running):
  docker compose -f compose/utils.yml exec wrk2 sh -lc "WRK_ITERATIONS=1 WRK_SAVE_LOGS=false /script/benchmark.sh"
EOF
}
