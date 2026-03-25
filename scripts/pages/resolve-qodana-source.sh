#!/usr/bin/env bash
# scripts/pages/resolve-qodana-source.sh
#
# Resolves the Qodana workflow run whose report artifacts should be
# published to GitHub Pages.
#
# Required env:
#   GITHUB_TOKEN        – token with actions:read scope
#   EVENT_NAME          – github.event_name
#   WR_ID               – github.event.workflow_run.id  (only for workflow_run)
#   WR_HEAD_SHA         – github.event.workflow_run.head_sha (only for workflow_run)
#   GITHUB_REPOSITORY   – owner/repo
#   GITHUB_OUTPUT       – path to the step output file
#
# Outputs (written to GITHUB_OUTPUT):
#   run_id    – the workflow run ID to fetch artifacts from
#   head_sha  – the commit SHA that was analyzed

set -euo pipefail

if [[ "$EVENT_NAME" == "workflow_run" ]]; then
  echo "run_id=$WR_ID" >> "$GITHUB_OUTPUT"
  echo "head_sha=$WR_HEAD_SHA" >> "$GITHUB_OUTPUT"
  exit 0
fi

response_file="$(mktemp)"
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/qodana_code_quality.yml/runs?branch=main&status=completed&per_page=20" \
  -o "$response_file"; then
  echo "Warning: GitHub API request for Qodana workflow runs failed; GitHub Pages will publish without hosted Qodana reports."
  exit 0
fi

resolved="$(python3 - "$response_file" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

for run in data.get("workflow_runs", []):
    if run.get("conclusion") == "success":
        print(f"run_id={run['id']}")
        print(f"head_sha={run['head_sha']}")
        break
PY
)"

if [[ -n "$resolved" ]]; then
  printf '%s\n' "$resolved" >> "$GITHUB_OUTPUT"
else
  echo "No successful Qodana workflow run on main was found; GitHub Pages will publish without hosted Qodana reports."
fi