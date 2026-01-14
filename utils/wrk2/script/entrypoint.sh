#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)"
# shellcheck source=/dev/null
. "${SCRIPT_DIR}/lib.sh"

apply_tz

# Print config once on boot (shared printer used by benchmark.sh as well)
print_common_vars summary

READY_PID=""
stop() {
  echo "[wrk2] shutdown requested" >&2
  if [ -n "${READY_PID}" ] && kill -0 "${READY_PID}" 2>/dev/null; then
    kill "${READY_PID}" 2>/dev/null || true
    wait "${READY_PID}" 2>/dev/null || true
  fi
  exit 0
}
trap stop SIGINT SIGTERM

# Start readiness server in background
"${SCRIPT_DIR}/ready.sh" &
READY_PID=$!

# small sanity check
sleep 0.2
if ! kill -0 "${READY_PID}" 2>/dev/null; then
  echo "[wrk2] ERROR: readiness endpoint failed to start" >&2
  exit 1
fi

EXIT_AFTER_AUTORUN="${WRK_EXIT_AFTER_AUTORUN:-false}"

# If configured to auto-run benchmarks on container start, do so.
if [ "${WRK_AUTORUN:-true}" = "true" ]; then
  set +e
  WRK_PRINT_CONFIG=false "${SCRIPT_DIR}/benchmark.sh"
  bench_rc=$?
  set -e

  # Optional mode: stop the container after autorun finishes.
  if [ "${EXIT_AFTER_AUTORUN}" = "true" ]; then
    echo "[wrk2] WRK_EXIT_AFTER_AUTORUN=true; stopping container after autorun" >&2

    if [ -n "${READY_PID}" ] && kill -0 "${READY_PID}" 2>/dev/null; then
      kill "${READY_PID}" 2>/dev/null || true
      wait "${READY_PID}" 2>/dev/null || true
    fi

    exit "${bench_rc}"
  fi
else
  echo "[wrk2] WRK_AUTORUN=false; not running benchmarks automatically" >&2
fi

# Keep container alive for exec/debugging while readiness stays up
echo "[wrk2] idle; exec into the container and run: /script/benchmark.sh" >&2
wait "${READY_PID}"