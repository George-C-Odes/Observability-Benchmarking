#!/usr/bin/env bash
# scripts/pages/resolve-go-quality-source.sh
#
# Resolves the Go Quality workflow run whose quality report
# artifact should be published to GitHub Pages.
#
# Required env:
#   GITHUB_TOKEN        – token with actions:read scope
#   EVENT_NAME          – github.event_name
#   WR_ID               – github.event.workflow_run.id  (only for workflow_run)
#   WR_NAME             – github.event.workflow_run.name (only for workflow_run)
#   WR_HEAD_SHA         – github.event.workflow_run.head_sha (only for workflow_run)
#   GITHUB_REPOSITORY   – owner/repo
#   GITHUB_OUTPUT       – path to the step output file
#
# Outputs (written to GITHUB_OUTPUT):
#   run_id    – the workflow run ID to fetch artifacts from
#   head_sha  – the commit SHA that was analyzed

set -euo pipefail

WORKFLOW_NAME="Go Quality"

# If the Pages build was triggered directly by this workflow, use that run.
if [[ "$EVENT_NAME" == "workflow_run" && "${WR_NAME:-}" == "$WORKFLOW_NAME" ]]; then
  echo "run_id=$WR_ID"   >> "$GITHUB_OUTPUT"
  echo "head_sha=$WR_HEAD_SHA" >> "$GITHUB_OUTPUT"
  exit 0
fi

# Otherwise, query the API for the latest completed run on main.
# The Go Quality workflow uploads its report artifact even when lint fails
# (via `if: always() && !cancelled()`), so we accept both success and failure.
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/go_quality.yml/runs?branch=main&status=completed&per_page=20" \
  -o "$response_file"; then
  echo "Warning: GitHub API request for Go Quality workflow runs failed; Pages will publish without a hosted Go quality report."
  exit 0
fi

resolved="$(python3 - "$response_file" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

for run in data.get("workflow_runs", []):
    if run.get("conclusion") in ("success", "failure"):
        print(f"run_id={run['id']}")
        print(f"head_sha={run['head_sha']}")
        break
PY
)"

if [[ -n "$resolved" ]]; then
  printf '%s\n' "$resolved" >> "$GITHUB_OUTPUT"
else
  echo "No completed Go Quality workflow run on main was found; Pages will publish without a hosted Go quality report."
fi
