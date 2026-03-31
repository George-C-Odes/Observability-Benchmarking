#!/usr/bin/env bash
# scripts/pages/resolve-source.sh
#
# Generic resolver for quality-report workflow run artifacts.
# Replaces the five near-identical resolve-*-source.sh scripts with a
# single parameterized implementation.
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
# Caller-supplied env:
#   RESOLVE_WORKFLOW_NAME   – display name to match (e.g. "Go Quality")
#   RESOLVE_WORKFLOW_FILE   – filename for the API query (e.g. "go_quality.yml")
#   RESOLVE_ACCEPTED        – comma-separated conclusions to accept when
#                             querying the API, e.g. "success" or "success,failure".
#                             Default: "success".
#
# Why some workflows accept "failure":
#   Go Quality and CodeQL upload their report artifacts unconditionally
#   (via `if: always() && !cancelled()`), so even a failing run produces a
#   downloadable quality report.  Other workflows (Qodana, Next.js, Django)
#   only produce useful artifacts on success.
#
# Outputs (written to GITHUB_OUTPUT):
#   run_id    – the workflow run ID to fetch artifacts from
#   head_sha  – the commit SHA that was analyzed

set -euo pipefail

WORKFLOW_NAME="${RESOLVE_WORKFLOW_NAME:?RESOLVE_WORKFLOW_NAME is required}"
WORKFLOW_FILE="${RESOLVE_WORKFLOW_FILE:?RESOLVE_WORKFLOW_FILE is required}"
ACCEPTED="${RESOLVE_ACCEPTED:-success}"

# If the Pages build was triggered directly by this workflow, use that run.
if [[ "$EVENT_NAME" == "workflow_run" && "${WR_NAME:-}" == "$WORKFLOW_NAME" ]]; then
  echo "run_id=$WR_ID"        >> "$GITHUB_OUTPUT"
  echo "head_sha=$WR_HEAD_SHA" >> "$GITHUB_OUTPUT"
  exit 0
fi

# Otherwise, query the API for the latest completed run on main.
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&status=completed&per_page=20" \
  -o "$response_file"; then
  echo "Warning: GitHub API request for ${WORKFLOW_NAME} workflow runs failed; Pages will publish without a hosted ${WORKFLOW_NAME} quality report."
  exit 0
fi

resolved="$(python3 - "$response_file" "$ACCEPTED" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

accepted = set(sys.argv[2].split(","))

for run in data.get("workflow_runs", []):
    if run.get("conclusion") in accepted:
        print(f"run_id={run['id']}")
        print(f"head_sha={run['head_sha']}")
        break
PY
)"

if [[ -n "$resolved" ]]; then
  printf '%s\n' "$resolved" >> "$GITHUB_OUTPUT"
else
  echo "No completed ${WORKFLOW_NAME} workflow run with accepted conclusion (${ACCEPTED}) on main was found; Pages will publish without a hosted ${WORKFLOW_NAME} quality report."
fi

