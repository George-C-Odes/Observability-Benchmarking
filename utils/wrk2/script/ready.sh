#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${SCRIPT_DIR}/lib.sh"

apply_tz

READY_PORT="${WRK_READY_PORT:-3003}"

echo "[wrk2] starting readiness endpoint on 0.0.0.0:${READY_PORT} (/ready)" >&2

ready_root="/tmp/wrk2-ready"
mkdir -p "${ready_root}"
echo "OK" >"${ready_root}/ready"

if ! command -v httpd >/dev/null 2>&1; then
  echo "[wrk2] ERROR: readiness endpoint requires 'httpd' (install busybox-extras)" >&2
  exit 1
fi

# foreground; container entrypoint will background it if needed
exec httpd -f -p "0.0.0.0:${READY_PORT}" -h "${ready_root}"