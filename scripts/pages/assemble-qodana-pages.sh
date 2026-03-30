#!/usr/bin/env bash
# scripts/pages/assemble-qodana-pages.sh
#
# Resolves quality-report statuses for every scope (Qodana JVM, Qodana
# Python, Go, Next.js, CodeQL), generates human-readable messages, logs the
# resolution, and assembles the HTML pages under _site/quality/.
#
# This single script replaces the previous inline steps:
#   "Resolve normalized quality-report statuses"
#   "Resolve quality-report messages"
#   "Log quality-report resolution"
#   "Publish quality reports into the Pages site"
#
# Required env:
#   SERVICES_ARTIFACT_PRESENT    – true | false | unknown
#   ORCHESTRATOR_ARTIFACT_PRESENT – true | false | unknown
#   SERVICES_DOWNLOAD_OUTCOME    – success | failure | skipped | (empty)
#   ORCHESTRATOR_DOWNLOAD_OUTCOME – success | failure | skipped | (empty)
#   QODANA_RUN_ID                – resolved workflow run ID (may be empty)
#   QODANA_HEAD_SHA              – resolved commit SHA (may be empty)
#   QODANA_PAGES_DIR             – staging path, e.g. ./.qodana-pages
#   SITE_DIR                     – built site root, e.g. ./_site
#
# Next.js Dashboard quality report (optional):
#   NEXTJS_QUALITY_RUN_ID        – resolved Next.js quality workflow run ID (may be empty)
#   NEXTJS_QUALITY_HEAD_SHA      – resolved commit SHA (may be empty)
#   NEXTJS_DOWNLOAD_OUTCOME      – success | failure | skipped | (empty)
#   NEXTJS_QUALITY_PAGES_DIR     – staging path, e.g. ./.nextjs-quality-pages
#
# Django Python quality report (optional):
#   DJANGO_PYTHON_QUALITY_RUN_ID    – resolved Django Python quality workflow run ID (may be empty)
#   DJANGO_PYTHON_QUALITY_HEAD_SHA  – resolved commit SHA (may be empty)
#   DJANGO_PYTHON_DOWNLOAD_OUTCOME  – success | failure | skipped | (empty)
#   DJANGO_PYTHON_QUALITY_PAGES_DIR – staging path, e.g. ./.django-python-quality-pages
#
# Go quality report (optional):
#   GO_QUALITY_RUN_ID      – resolved Go quality workflow run ID (may be empty)
#   GO_QUALITY_HEAD_SHA    – resolved commit SHA (may be empty)
#   GO_DOWNLOAD_OUTCOME    – success | failure | skipped | (empty)
#   GO_QUALITY_PAGES_DIR   – staging path, e.g. ./.go-quality-pages
#
# CodeQL security & quality report (optional):
#   CODEQL_QUALITY_RUN_ID      – resolved CodeQL workflow run ID (may be empty)
#   CODEQL_QUALITY_HEAD_SHA    – resolved commit SHA (may be empty)
#   CODEQL_DOWNLOAD_OUTCOME    – success | failure | skipped | (empty)
#   CODEQL_QUALITY_PAGES_DIR   – staging path, e.g. ./.codeql-quality-pages

set -euo pipefail

QODANA_PAGES_DIR="${QODANA_PAGES_DIR:-./.qodana-pages}"
SITE_DIR="${SITE_DIR:-./_site}"
NEXTJS_QUALITY_PAGES_DIR="${NEXTJS_QUALITY_PAGES_DIR:-./.nextjs-quality-pages}"
DJANGO_PYTHON_QUALITY_PAGES_DIR="${DJANGO_PYTHON_QUALITY_PAGES_DIR:-./.django-python-quality-pages}"
GO_QUALITY_PAGES_DIR="${GO_QUALITY_PAGES_DIR:-./.go-quality-pages}"
CODEQL_QUALITY_PAGES_DIR="${CODEQL_QUALITY_PAGES_DIR:-./.codeql-quality-pages}"

# ---------------------------------------------------------------------------
# 1. Resolve per-scope statuses
# ---------------------------------------------------------------------------

resolve_status() {
  local directory_path="$1"
  local artifact_present="$2"
  local download_outcome="$3"

  if [[ -d "$directory_path" ]]; then
    if find "$directory_path" -type f -name 'index.html' -print -quit | grep -q .; then
      echo 'available'
    elif [[ "$artifact_present" == 'true' && "$download_outcome" == 'success' ]]; then
      echo 'unavailable'
    elif [[ "$artifact_present" == 'true' && "$download_outcome" == 'failure' ]]; then
      echo 'download failed'
    elif [[ "$artifact_present" == 'false' ]]; then
      echo 'unavailable'
    elif [[ -n "${QODANA_RUN_ID:-}" ]]; then
      echo 'undetermined'
    else
      echo 'not-applicable'
    fi
  elif [[ "$artifact_present" == 'true' && "$download_outcome" == 'failure' ]]; then
    echo 'download failed'
  elif [[ "$artifact_present" == 'false' ]]; then
    echo 'unavailable'
  elif [[ -n "${QODANA_RUN_ID:-}" ]]; then
    echo 'undetermined'
  else
    echo 'not-applicable'
  fi
}

services_status="$(resolve_status "$QODANA_PAGES_DIR/services-java" "$SERVICES_ARTIFACT_PRESENT" "$SERVICES_DOWNLOAD_OUTCOME")"
orchestrator_status="$(resolve_status "$QODANA_PAGES_DIR/orchestrator" "$ORCHESTRATOR_ARTIFACT_PRESENT" "$ORCHESTRATOR_DOWNLOAD_OUTCOME")"

# Next.js Dashboard quality report: simpler resolution — there is no
# artifact-inspection step (only one artifact, not a matrix).  If the
# download step ran and succeeded the directory will contain index.html.
resolve_nextjs_status() {
  local dir="$1"
  local download_outcome="${NEXTJS_DOWNLOAD_OUTCOME:-}"
  local run_id="${NEXTJS_QUALITY_RUN_ID:-}"

  if [[ -d "$dir" ]] && find "$dir" -type f -name 'index.html' -print -quit | grep -q .; then
    echo 'available'
  elif [[ "$download_outcome" == 'failure' ]]; then
    echo 'download failed'
  elif [[ "$download_outcome" == 'success' ]]; then
    echo 'unavailable'
  elif [[ -n "$run_id" ]]; then
    echo 'undetermined'
  else
    echo 'not-applicable'
  fi
}
nextjs_status="$(resolve_nextjs_status "$NEXTJS_QUALITY_PAGES_DIR/nextjs-dash")"

# Django Python quality report: same simple resolution as Next.js — single
# artifact from the Django Python Quality workflow.
resolve_django_python_status() {
  local dir="$1"
  local download_outcome="${DJANGO_PYTHON_DOWNLOAD_OUTCOME:-}"
  local run_id="${DJANGO_PYTHON_QUALITY_RUN_ID:-}"

  if [[ -d "$dir" ]] && find "$dir" -type f -name 'index.html' -print -quit | grep -q .; then
    echo 'available'
  elif [[ "$download_outcome" == 'failure' ]]; then
    echo 'download failed'
  elif [[ "$download_outcome" == 'success' ]]; then
    echo 'unavailable'
  elif [[ -n "$run_id" ]]; then
    echo 'undetermined'
  else
    echo 'not-applicable'
  fi
}
django_python_status="$(resolve_django_python_status "$DJANGO_PYTHON_QUALITY_PAGES_DIR/django-python")"

# Go quality report: same simple resolution as Next.js and Django —
# single artifact from the Go Quality workflow.
resolve_go_status() {
  local dir="$1"
  local download_outcome="${GO_DOWNLOAD_OUTCOME:-}"
  local run_id="${GO_QUALITY_RUN_ID:-}"

  if [[ -d "$dir" ]] && find "$dir" -type f -name 'index.html' -print -quit | grep -q .; then
    echo 'available'
  elif [[ "$download_outcome" == 'failure' ]]; then
    echo 'download failed'
  elif [[ "$download_outcome" == 'success' ]]; then
    echo 'unavailable'
  elif [[ -n "$run_id" ]]; then
    echo 'undetermined'
  else
    echo 'not-applicable'
  fi
}
go_status="$(resolve_go_status "$GO_QUALITY_PAGES_DIR/go")"

# CodeQL security & quality report: same simple resolution as Go —
# single artifact from the CodeQL workflow.
resolve_codeql_status() {
  local dir="$1"
  local download_outcome="${CODEQL_DOWNLOAD_OUTCOME:-}"
  local run_id="${CODEQL_QUALITY_RUN_ID:-}"

  if [[ -d "$dir" ]] && find "$dir" -type f -name 'index.html' -print -quit | grep -q .; then
    echo 'available'
  elif [[ "$download_outcome" == 'failure' ]]; then
    echo 'download failed'
  elif [[ "$download_outcome" == 'success' ]]; then
    echo 'unavailable'
  elif [[ -n "$run_id" ]]; then
    echo 'undetermined'
  else
    echo 'not-applicable'
  fi
}
codeql_status="$(resolve_codeql_status "$CODEQL_QUALITY_PAGES_DIR/codeql")"

# ---------------------------------------------------------------------------
# 2. Resolve human-readable messages
# ---------------------------------------------------------------------------

services_item_text='services-java report is not available yet.'
services_item_html='<li>services-java report is not available yet.</li>'
orchestrator_item_text='orchestrator report is not available yet.'
orchestrator_item_html='<li>orchestrator report is not available yet.</li>'
report_metadata_text='No successful Qodana JVM report has been published to GitHub Pages yet.'
report_metadata_html='<p>No successful Qodana JVM report has been published to GitHub Pages yet.</p>'
status_notice_text=''
status_notice_html=''

case "$services_status" in
  available)
    services_item_text='services-java report is available.'
    services_item_html='<li><a href="./services-java/">services-java report</a></li>'
    ;;
  'download failed')
    services_item_text='services-java report could not be downloaded for the resolved run.'
    services_item_html='<li>services-java report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    services_item_text='services-java report is not available for the resolved run.'
    services_item_html='<li>services-java report is not available for the resolved run.</li>'
    ;;
  undetermined)
    services_item_text='services-java report availability could not be determined for the resolved run.'
    services_item_html='<li>services-java report availability could not be determined for the resolved run.</li>'
    ;;
esac

case "$orchestrator_status" in
  available)
    orchestrator_item_text='orchestrator report is available.'
    orchestrator_item_html='<li><a href="./orchestrator/">orchestrator report</a></li>'
    ;;
  'download failed')
    orchestrator_item_text='orchestrator report could not be downloaded for the resolved run.'
    orchestrator_item_html='<li>orchestrator report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    orchestrator_item_text='orchestrator report is not available for the resolved run.'
    orchestrator_item_html='<li>orchestrator report is not available for the resolved run.</li>'
    ;;
  undetermined)
    orchestrator_item_text='orchestrator report availability could not be determined for the resolved run.'
    orchestrator_item_html='<li>orchestrator report availability could not be determined for the resolved run.</li>'
    ;;
esac

# Next.js Dashboard quality report messages
nextjs_item_text='nextjs-dash quality report is not available yet.'
nextjs_item_html='<li>nextjs-dash quality report is not available yet.</li>'
nextjs_metadata_text=''
nextjs_metadata_html=''

case "$nextjs_status" in
  available)
    nextjs_item_text='nextjs-dash quality report is available (ESLint + TypeScript).'
    nextjs_item_html='<li><a href="./nextjs-dash/">nextjs-dash quality report</a> (ESLint + TypeScript)</li>'
    ;;
  'download failed')
    nextjs_item_text='nextjs-dash quality report could not be downloaded for the resolved run.'
    nextjs_item_html='<li>nextjs-dash quality report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    nextjs_item_text='nextjs-dash quality report is not available for the resolved run.'
    nextjs_item_html='<li>nextjs-dash quality report is not available for the resolved run.</li>'
    ;;
  undetermined)
    nextjs_item_text='nextjs-dash quality report availability could not be determined for the resolved run.'
    nextjs_item_html='<li>nextjs-dash quality report availability could not be determined for the resolved run.</li>'
    ;;
esac

if [[ -n "${NEXTJS_QUALITY_RUN_ID:-}" ]]; then
  if [[ "$nextjs_status" == 'available' ]]; then
    nextjs_metadata_text="Next.js quality report from workflow run ${NEXTJS_QUALITY_RUN_ID} for commit ${NEXTJS_QUALITY_HEAD_SHA:-unknown}."
    nextjs_metadata_html="<p>Next.js quality report from workflow run <code>${NEXTJS_QUALITY_RUN_ID}</code> for commit <code>${NEXTJS_QUALITY_HEAD_SHA:-unknown}</code>.</p>"
  fi
fi

# Django Python quality report messages
django_python_item_text='django-python quality report is not available yet.'
django_python_item_html='<li>django-python quality report is not available yet.</li>'
django_python_metadata_text=''
django_python_metadata_html=''

case "$django_python_status" in
  available)
    django_python_item_text='django-python quality report is available (Qodana Python Community).'
    django_python_item_html='<li><a href="./django-python/">django-python quality report</a> (Qodana Python Community)</li>'
    ;;
  'download failed')
    django_python_item_text='django-python quality report could not be downloaded for the resolved run.'
    django_python_item_html='<li>django-python quality report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    django_python_item_text='django-python quality report is not available for the resolved run.'
    django_python_item_html='<li>django-python quality report is not available for the resolved run.</li>'
    ;;
  undetermined)
    django_python_item_text='django-python quality report availability could not be determined for the resolved run.'
    django_python_item_html='<li>django-python quality report availability could not be determined for the resolved run.</li>'
    ;;
esac

if [[ -n "${DJANGO_PYTHON_QUALITY_RUN_ID:-}" ]]; then
  if [[ "$django_python_status" == 'available' ]]; then
    django_python_metadata_text="Django Python quality report from workflow run ${DJANGO_PYTHON_QUALITY_RUN_ID} for commit ${DJANGO_PYTHON_QUALITY_HEAD_SHA:-unknown}."
    django_python_metadata_html="<p>Django Python quality report from workflow run <code>${DJANGO_PYTHON_QUALITY_RUN_ID}</code> for commit <code>${DJANGO_PYTHON_QUALITY_HEAD_SHA:-unknown}</code>.</p>"
  fi
fi

# Go quality report messages
go_item_text='go quality report is not available yet.'
go_item_html='<li>go quality report is not available yet.</li>'
go_metadata_text=''
go_metadata_html=''

case "$go_status" in
  available)
    go_item_text='go quality report is available (golangci-lint).'
    go_item_html='<li><a href="./go/">go quality report</a> (golangci-lint)</li>'
    ;;
  'download failed')
    go_item_text='go quality report could not be downloaded for the resolved run.'
    go_item_html='<li>go quality report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    go_item_text='go quality report is not available for the resolved run.'
    go_item_html='<li>go quality report is not available for the resolved run.</li>'
    ;;
  undetermined)
    go_item_text='go quality report availability could not be determined for the resolved run.'
    go_item_html='<li>go quality report availability could not be determined for the resolved run.</li>'
    ;;
esac

if [[ -n "${GO_QUALITY_RUN_ID:-}" ]]; then
  if [[ "$go_status" == 'available' ]]; then
    go_metadata_text="Go quality report from workflow run ${GO_QUALITY_RUN_ID} for commit ${GO_QUALITY_HEAD_SHA:-unknown}."
    go_metadata_html="<p>Go quality report from workflow run <code>${GO_QUALITY_RUN_ID}</code> for commit <code>${GO_QUALITY_HEAD_SHA:-unknown}</code>.</p>"
  fi
fi

# CodeQL security and quality report messages
codeql_item_text='codeql security and quality report is not available yet.'
codeql_item_html='<li>codeql security &amp; quality report is not available yet.</li>'
codeql_metadata_text=''
codeql_metadata_html=''

case "$codeql_status" in
  available)
    codeql_item_text='codeql security and quality report is available (CodeQL SARIF).'
    codeql_item_html='<li><a href="./codeql/">codeql security &amp; quality report</a> (CodeQL SARIF)</li>'
    ;;
  'download failed')
    codeql_item_text='codeql security and quality report could not be downloaded for the resolved run.'
    codeql_item_html='<li>codeql security &amp; quality report could not be downloaded for the resolved run.</li>'
    ;;
  unavailable)
    codeql_item_text='codeql security and quality report is not available for the resolved run.'
    codeql_item_html='<li>codeql security &amp; quality report is not available for the resolved run.</li>'
    ;;
  undetermined)
    codeql_item_text='codeql security and quality report availability could not be determined for the resolved run.'
    codeql_item_html='<li>codeql security &amp; quality report availability could not be determined for the resolved run.</li>'
    ;;
esac

if [[ -n "${CODEQL_QUALITY_RUN_ID:-}" ]]; then
  if [[ "$codeql_status" == 'available' ]]; then
    codeql_metadata_text="CodeQL report from workflow run ${CODEQL_QUALITY_RUN_ID} for commit ${CODEQL_QUALITY_HEAD_SHA:-unknown}."
    codeql_metadata_html="<p>CodeQL report from workflow run <code>${CODEQL_QUALITY_RUN_ID}</code> for commit <code>${CODEQL_QUALITY_HEAD_SHA:-unknown}</code>.</p>"
  fi
fi

if [[ -n "${QODANA_RUN_ID:-}" ]]; then
  if [[ "$services_status" == 'available' || "$orchestrator_status" == 'available' ]]; then
    report_metadata_text="This page currently hosts reports from workflow run $QODANA_RUN_ID for commit $QODANA_HEAD_SHA."
    report_metadata_html="<p>This page currently hosts reports from workflow run <code>$QODANA_RUN_ID</code> for commit <code>$QODANA_HEAD_SHA</code>.</p>"
  else
    report_metadata_text="A successful Qodana JVM run was found for workflow run $QODANA_RUN_ID at commit $QODANA_HEAD_SHA, but its report artifacts are currently unavailable. GitHub Pages will continue to publish the documentation site without hosted Qodana JVM reports for that run."
    report_metadata_html="<p>A successful Qodana JVM run was found for workflow run <code>$QODANA_RUN_ID</code> at commit <code>$QODANA_HEAD_SHA</code>, but its report artifacts are currently unavailable. GitHub Pages will continue to publish the documentation site without hosted Qodana JVM reports for that run.</p>"
  fi
fi

if [[ "$SERVICES_ARTIFACT_PRESENT" == 'unknown' || "$ORCHESTRATOR_ARTIFACT_PRESENT" == 'unknown' ]]; then
  status_notice_text='GitHub Pages could not determine artifact availability for the resolved Qodana JVM run, so missing reports are shown as undetermined rather than unavailable.'
  status_notice_html='<p><strong>Note:</strong> GitHub Pages could not determine artifact availability for the resolved Qodana JVM run, so missing reports are shown as undetermined rather than unavailable.</p>'
elif [[ "$SERVICES_DOWNLOAD_OUTCOME" == 'failure' || "$ORCHESTRATOR_DOWNLOAD_OUTCOME" == 'failure' ]]; then
  status_notice_text='At least one Qodana JVM artifact existed for the resolved run but could not be downloaded. This usually indicates an artifact retrieval problem rather than a missing report.'
  status_notice_html='<p><strong>Note:</strong> At least one Qodana JVM artifact existed for the resolved run but could not be downloaded. This usually indicates an artifact retrieval problem rather than a missing report.</p>'
fi

# ---------------------------------------------------------------------------
# 3. Log resolution
# ---------------------------------------------------------------------------

echo 'Qodana JVM report resolution:'
if [[ -n "${QODANA_RUN_ID:-}" ]]; then
  echo "  resolved run id: $QODANA_RUN_ID"
  echo "  resolved head sha: $QODANA_HEAD_SHA"
else
  echo '  resolved run id: none'
  echo '  resolved head sha: none'
fi
echo "  services-java artifact listed: ${SERVICES_ARTIFACT_PRESENT:-not-checked}"
echo "  services-java download outcome: ${SERVICES_DOWNLOAD_OUTCOME:-not-run}"
echo "  services-java final status: $services_status"
echo "  services-java message: $services_item_text"
echo "  orchestrator artifact listed: ${ORCHESTRATOR_ARTIFACT_PRESENT:-not-checked}"
echo "  orchestrator download outcome: ${ORCHESTRATOR_DOWNLOAD_OUTCOME:-not-run}"
echo "  orchestrator final status: $orchestrator_status"
echo "  orchestrator message: $orchestrator_item_text"
echo "  page metadata: $report_metadata_text"
if [[ -n "$status_notice_text" ]]; then
  echo "  note: $status_notice_text"
fi
echo ''
echo 'Next.js Dashboard quality report resolution:'
if [[ -n "${NEXTJS_QUALITY_RUN_ID:-}" ]]; then
  echo "  resolved run id: $NEXTJS_QUALITY_RUN_ID"
  echo "  resolved head sha: ${NEXTJS_QUALITY_HEAD_SHA:-none}"
else
  echo '  resolved run id: none'
fi
echo "  nextjs-dash download outcome: ${NEXTJS_DOWNLOAD_OUTCOME:-not-run}"
echo "  nextjs-dash final status: $nextjs_status"
echo "  nextjs-dash message: $nextjs_item_text"
if [[ -n "$nextjs_metadata_text" ]]; then
  echo "  nextjs-dash metadata: $nextjs_metadata_text"
fi
echo ''
echo 'Django Python quality report resolution:'
if [[ -n "${DJANGO_PYTHON_QUALITY_RUN_ID:-}" ]]; then
  echo "  resolved run id: $DJANGO_PYTHON_QUALITY_RUN_ID"
  echo "  resolved head sha: ${DJANGO_PYTHON_QUALITY_HEAD_SHA:-none}"
else
  echo '  resolved run id: none'
fi
echo "  django-python download outcome: ${DJANGO_PYTHON_DOWNLOAD_OUTCOME:-not-run}"
echo "  django-python final status: $django_python_status"
echo "  django-python message: $django_python_item_text"
if [[ -n "$django_python_metadata_text" ]]; then
  echo "  django-python metadata: $django_python_metadata_text"
fi
echo ''
echo 'Go quality report resolution:'
if [[ -n "${GO_QUALITY_RUN_ID:-}" ]]; then
  echo "  resolved run id: $GO_QUALITY_RUN_ID"
  echo "  resolved head sha: ${GO_QUALITY_HEAD_SHA:-none}"
else
  echo '  resolved run id: none'
fi
echo "  go download outcome: ${GO_DOWNLOAD_OUTCOME:-not-run}"
echo "  go final status: $go_status"
echo "  go message: $go_item_text"
if [[ -n "$go_metadata_text" ]]; then
  echo "  go metadata: $go_metadata_text"
fi
echo ''
echo 'CodeQL security & quality report resolution:'
if [[ -n "${CODEQL_QUALITY_RUN_ID:-}" ]]; then
  echo "  resolved run id: $CODEQL_QUALITY_RUN_ID"
  echo "  resolved head sha: ${CODEQL_QUALITY_HEAD_SHA:-none}"
else
  echo '  resolved run id: none'
fi
echo "  codeql download outcome: ${CODEQL_DOWNLOAD_OUTCOME:-not-run}"
echo "  codeql final status: $codeql_status"
echo "  codeql message: $codeql_item_text"
if [[ -n "$codeql_metadata_text" ]]; then
  echo "  codeql metadata: $codeql_metadata_text"
fi

# ---------------------------------------------------------------------------
# 4. Publish reports into the Pages site
# ---------------------------------------------------------------------------

mkdir -p "$SITE_DIR/quality/services-java" "$SITE_DIR/quality/orchestrator" "$SITE_DIR/quality/nextjs-dash" "$SITE_DIR/quality/django-python" "$SITE_DIR/quality/go" "$SITE_DIR/quality/codeql"

write_html_file() {
  local target_path="$1"
  shift
  printf '%s\n' "$@" > "$target_path"
}

create_scope_page() {
  local scope_name="$1"
  local scope_dir="$SITE_DIR/quality/$scope_name"
  local scope_message="$2"

  local nested_index
  nested_index="$({
    find "$scope_dir" -type f -name 'index.html' -printf '%P\n' 2>/dev/null \
      | grep -v '^index.html$' || true
  } | python3 -c "
import sys
paths = [l.strip() for l in sys.stdin if l.strip()]
report = [p for p in paths if p.endswith('report/index.html')]
choices = report or paths
choices = sorted(choices, key=lambda p: (p.count('/'), p))
print(choices[0] if choices else '')
")"

  # If the downloaded report already ships its own top-level index.html, keep it.
  if [[ -f "$scope_dir/index.html" ]]; then
    return
  fi

  if [[ -n "$nested_index" ]]; then
    # URL-encode path segments and HTML-escape for safe injection into HTML.
    local nested_index_url nested_index_html
    nested_index_url="$(python3 -c "
import sys, urllib.parse
raw = sys.stdin.read().strip()
print('/'.join(urllib.parse.quote(seg, safe='') for seg in raw.split('/')))
" <<< "$nested_index")"
    nested_index_html="$(python3 -c "
import sys, html
print(html.escape(sys.stdin.read().strip()))
" <<< "$nested_index_url")"

    write_html_file "$scope_dir/index.html" \
      '<!doctype html>' \
      '<html lang="en">' \
      '<head>' \
      '  <meta charset="utf-8">' \
      "  <meta http-equiv=\"refresh\" content=\"0; url=./${nested_index_html}\">" \
      '  <meta name="viewport" content="width=device-width, initial-scale=1">' \
      '  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Cpath d=%27M32 2L6 14v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V14Z%27 fill=%27%234695EB%27/%3E%3Cpath d=%27M28 40l-9-9 3.5-3.5L28 33l13.5-13.5L45 23Z%27 fill=%27%23fff%27/%3E%3C/svg%3E">' \
      "  <title>${scope_name} quality report</title>" \
      '</head>' \
      '<body>' \
      "  <p>Redirecting to the hosted quality report for <code>${scope_name}</code>...</p>" \
      "  <p>If the redirect does not happen automatically, open <a href=\"./${nested_index_html}\">the report here</a>.</p>" \
      '</body>' \
      '</html>'
  else
    write_html_file "$scope_dir/index.html" \
      '<!doctype html>' \
      '<html lang="en">' \
      '<head>' \
      '  <meta charset="utf-8">' \
      '  <meta name="viewport" content="width=device-width, initial-scale=1">' \
      '  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Cpath d=%27M32 2L6 14v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V14Z%27 fill=%27%234695EB%27/%3E%3Cpath d=%27M28 40l-9-9 3.5-3.5L28 33l13.5-13.5L45 23Z%27 fill=%27%23fff%27/%3E%3C/svg%3E">' \
      "  <title>${scope_name} quality report</title>" \
      '  <style>' \
      '    body { font-family: Arial, sans-serif; margin: 2rem auto; max-width: 52rem; line-height: 1.6; padding: 0 1rem; }' \
      '    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }' \
      '  </style>' \
      '</head>' \
      '<body>' \
      "  <h1>${scope_name} quality report</h1>" \
      "  <p>${scope_message}</p>" \
      '  <p>Return to the <a href="../">quality reports index</a>.</p>' \
      '</body>' \
      '</html>'
  fi
}

# Copy downloaded report directories into the site tree.
if [[ -d "$QODANA_PAGES_DIR/services-java" ]]; then
  cp -a "$QODANA_PAGES_DIR/services-java/." "$SITE_DIR/quality/services-java/"
fi

if [[ -d "$QODANA_PAGES_DIR/orchestrator" ]]; then
  cp -a "$QODANA_PAGES_DIR/orchestrator/." "$SITE_DIR/quality/orchestrator/"
fi

# Copy the pre-generated Next.js quality report (index.html) into the site tree.
if [[ -d "$NEXTJS_QUALITY_PAGES_DIR/nextjs-dash" ]]; then
  cp -a "$NEXTJS_QUALITY_PAGES_DIR/nextjs-dash/." "$SITE_DIR/quality/nextjs-dash/"
fi

# Copy the Qodana Python Community report into the site tree.
if [[ -d "$DJANGO_PYTHON_QUALITY_PAGES_DIR/django-python" ]]; then
  cp -a "$DJANGO_PYTHON_QUALITY_PAGES_DIR/django-python/." "$SITE_DIR/quality/django-python/"
fi

# Copy the Go golangci-lint quality report into the site tree.
if [[ -d "$GO_QUALITY_PAGES_DIR/go" ]]; then
  cp -a "$GO_QUALITY_PAGES_DIR/go/." "$SITE_DIR/quality/go/"
fi

# Copy the CodeQL security & quality report into the site tree.
if [[ -d "$CODEQL_QUALITY_PAGES_DIR/codeql" ]]; then
  cp -a "$CODEQL_QUALITY_PAGES_DIR/codeql/." "$SITE_DIR/quality/codeql/"
fi

create_scope_page 'services-java' "$services_item_text"
create_scope_page 'orchestrator' "$orchestrator_item_text"
create_scope_page 'nextjs-dash' "$nextjs_item_text"
create_scope_page 'django-python' "$django_python_item_text"
create_scope_page 'go' "$go_item_text"
create_scope_page 'codeql' "$codeql_item_text"

# Landing page
write_html_file "$SITE_DIR/quality/index.html" \
  '<!doctype html>' \
  '<html lang="en">' \
  '<head>' \
  '  <meta charset="utf-8">' \
  '  <meta name="viewport" content="width=device-width, initial-scale=1">' \
  '  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Cpath d=%27M32 2L6 14v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V14Z%27 fill=%27%234695EB%27/%3E%3Cpath d=%27M28 40l-9-9 3.5-3.5L28 33l13.5-13.5L45 23Z%27 fill=%27%23fff%27/%3E%3C/svg%3E">' \
  '  <title>Quality reports</title>' \
  '  <style>' \
  '    body { font-family: Arial, sans-serif; margin: 2rem auto; max-width: 52rem; line-height: 1.6; padding: 0 1rem; }' \
  '    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }' \
  '    h2 { margin-top: 1.5rem; }' \
  '    h3 { margin-top: 1.25rem; }' \
  '  </style>' \
  '</head>' \
  '<body>' \
  '  <h1>Quality reports</h1>' \
  '  <p>Latest published code-quality reports from GitHub Actions on <code>main</code>.</p>' \
  '  <h2>Qodana</h2>' \
  '  <p>Static analysis powered by JetBrains Qodana.</p>' \
  '  <h3>JVM</h3>' \
  '  <p>IntelliJ-based static analysis via <code>jetbrains/qodana-jvm-community</code>.</p>' \
  '  <ul>' \
  "    ${services_item_html}" \
  "    ${orchestrator_item_html}" \
  '  </ul>' \
  "  ${report_metadata_html}" \
  "  ${status_notice_html}" \
  '  <h3>Python</h3>' \
  '  <p>PyCharm Community-based static analysis via <code>jetbrains/qodana-python-community</code>.</p>' \
  '  <ul>' \
  "    ${django_python_item_html}" \
  '  </ul>' \
  "  ${django_python_metadata_html}" \
  '  <h2>Go (golangci-lint)</h2>' \
  '  <p>Aggregated Go static analysis via <code>golangci-lint</code> — govet, staticcheck, errcheck, gosec, revive, and more.</p>' \
  '  <ul>' \
  "    ${go_item_html}" \
  '  </ul>' \
  "  ${go_metadata_html}" \
  '  <h2>Next.js Dashboard (ESLint + TypeScript)</h2>' \
  '  <p>ESLint and TypeScript strict-mode analysis — the free, open-source equivalent of JetBrains IDE inspections for JavaScript and TypeScript.</p>' \
  '  <ul>' \
  "    ${nextjs_item_html}" \
  '  </ul>' \
  "  ${nextjs_metadata_html}" \
  '  <h2>CodeQL (Security &amp; Quality)</h2>' \
  '  <p>Automated security vulnerability detection and code quality analysis powered by <a href="https://codeql.github.com/">GitHub CodeQL</a> — semantic code analysis covering CWE patterns, injection flaws, data-flow vulnerabilities, and more across Java, Python, Go, and JavaScript/TypeScript.</p>' \
  '  <ul>' \
  "    ${codeql_item_html}" \
  '  </ul>' \
  "  ${codeql_metadata_html}" \
  '</body>' \
  '</html>'