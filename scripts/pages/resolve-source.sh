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
#   WR_HEAD_BRANCH      – github.event.workflow_run.head_branch (only for workflow_run)
#   GITHUB_REPOSITORY   – owner/repo
#   GITHUB_OUTPUT       – path to the step output file
#
# Caller-supplied env:
#   RESOLVE_WORKFLOW_NAME   – display name to match (e.g. "Go Quality")
#   RESOLVE_WORKFLOW_FILE   – filename for the API query (e.g. "go_quality.yml")
#   RESOLVE_ACCEPTED        – comma-separated conclusions to accept when
#                             querying the API, e.g. "success" or "success,failure".
#                             Default: "success".
#   RESOLVE_BRANCH_MODE     – which branch scope to resolve:
#                             "main" (default) or "non-main".
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
BRANCH_MODE="${RESOLVE_BRANCH_MODE:-main}"

if [[ "$BRANCH_MODE" != 'main' && "$BRANCH_MODE" != 'non-main' ]]; then
  echo "Error: RESOLVE_BRANCH_MODE must be 'main' or 'non-main' (got: $BRANCH_MODE)" >&2
  exit 1
fi

# If the Pages build was triggered directly by this workflow, use that run when
# its branch scope matches the requested resolution mode.
if [[ "$EVENT_NAME" == "workflow_run" && "${WR_NAME:-}" == "$WORKFLOW_NAME" ]]; then
  if [[ "$BRANCH_MODE" == 'main' && "${WR_HEAD_BRANCH:-}" != 'main' ]]; then
    :
  elif [[ "$BRANCH_MODE" == 'non-main' && ( -z "${WR_HEAD_BRANCH:-}" || "${WR_HEAD_BRANCH:-}" == 'main' ) ]]; then
    :
  else
    echo "run_id=$WR_ID"        >> "$GITHUB_OUTPUT"
    echo "head_sha=$WR_HEAD_SHA" >> "$GITHUB_OUTPUT"
    exit 0
  fi
fi

# Otherwise, query the API for the latest completed run in the requested branch scope.
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
query_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?status=completed&per_page=100"
if [[ "$BRANCH_MODE" == 'main' ]]; then
  query_url+="&branch=main"
fi
if ! curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$query_url" \
  -o "$response_file"; then
  echo "Warning: GitHub API request for ${WORKFLOW_NAME} workflow runs failed; Pages will publish without a hosted ${WORKFLOW_NAME} quality report."
  exit 0
fi

resolved="$(python3 - "$response_file" "$ACCEPTED" "$BRANCH_MODE" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as fh:
    data = json.load(fh)

accepted = set(sys.argv[2].split(","))
branch_mode = sys.argv[3]

for run in data.get("workflow_runs", []):
    if run.get("conclusion") not in accepted:
        continue

    head_branch = run.get("head_branch")
    if branch_mode == "main" and head_branch != "main":
        continue
    if branch_mode == "non-main" and (not head_branch or head_branch == "main"):
        continue

    print(f"run_id={run['id']}")
    print(f"head_sha={run['head_sha']}")
    break
PY
)"

if [[ -n "$resolved" ]]; then
  printf '%s\n' "$resolved" >> "$GITHUB_OUTPUT"
else
  if [[ "$BRANCH_MODE" == 'main' ]]; then
    echo "No completed ${WORKFLOW_NAME} workflow run with accepted conclusion (${ACCEPTED}) on main was found; Pages will publish without a hosted ${WORKFLOW_NAME} quality report."
  else
    echo "No completed ${WORKFLOW_NAME} workflow run with accepted conclusion (${ACCEPTED}) on a non-main branch was found; Pages will publish without a hosted ${WORKFLOW_NAME} quality report in staging."
  fi
fi

