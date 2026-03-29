#!/usr/bin/env bash
# scripts/pages/inspect-qodana-artifacts.sh
#
# Queries the GitHub API for artifacts of a Qodana workflow run and writes
# availability flags to $GITHUB_OUTPUT.
#
# Required env:
#   GITHUB_TOKEN      – token with actions:read scope
#   QODANA_RUN_ID     – the workflow run ID to inspect
#   GITHUB_REPOSITORY – owner/repo
#   GITHUB_OUTPUT     – path to the step output file

set -euo pipefail

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${QODANA_RUN_ID}/artifacts?per_page=100" \
  -o "$response_file"; then
  echo "services_java_present=unknown" >> "$GITHUB_OUTPUT"
  echo "orchestrator_present=unknown" >> "$GITHUB_OUTPUT"
  exit 0
fi

artifact_statuses="$(python3 - "$response_file" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

names = {
    a.get("name") for a in data.get("artifacts", [])
    if not a.get("expired", False)
}

print("services_java_present=" + ("true" if "qodana-report-services-java" in names else "false"))
print("orchestrator_present=" + ("true" if "qodana-report-orchestrator" in names else "false"))
PY
)"

printf '%s\n' "$artifact_statuses" >> "$GITHUB_OUTPUT"