#!/usr/bin/env bash
# scripts/pages/assemble-qodana-pages.sh
#
# Resolves Qodana report statuses, generates human-readable messages,
# logs the resolution, and assembles the HTML pages under _site/qodana/.
#
# This single script replaces the previous inline steps:
#   "Resolve normalized Qodana report statuses"
#   "Resolve Qodana report messages"
#   "Log Qodana report resolution"
#   "Publish Qodana reports into the Pages site"
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

set -euo pipefail

QODANA_PAGES_DIR="${QODANA_PAGES_DIR:-./.qodana-pages}"
SITE_DIR="${SITE_DIR:-./_site}"
NEXTJS_QUALITY_PAGES_DIR="${NEXTJS_QUALITY_PAGES_DIR:-./.nextjs-quality-pages}"

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

# ---------------------------------------------------------------------------
# 2. Resolve human-readable messages
# ---------------------------------------------------------------------------

services_item_text='services-java report is not available yet.'
services_item_html='<li>services-java report is not available yet.</li>'
orchestrator_item_text='orchestrator report is not available yet.'
orchestrator_item_html='<li>orchestrator report is not available yet.</li>'
report_metadata_text='No successful Qodana report has been published to GitHub Pages yet.'
report_metadata_html='<p>No successful Qodana report has been published to GitHub Pages yet.</p>'
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

if [[ -n "${QODANA_RUN_ID:-}" ]]; then
  if [[ "$services_status" == 'available' || "$orchestrator_status" == 'available' ]]; then
    report_metadata_text="This page currently hosts reports from workflow run $QODANA_RUN_ID for commit $QODANA_HEAD_SHA."
    report_metadata_html="<p>This page currently hosts reports from workflow run <code>$QODANA_RUN_ID</code> for commit <code>$QODANA_HEAD_SHA</code>.</p>"
  else
    report_metadata_text="A successful Qodana run was found for workflow run $QODANA_RUN_ID at commit $QODANA_HEAD_SHA, but its report artifacts are currently unavailable. GitHub Pages will continue to publish the documentation site without hosted Qodana reports for that run."
    report_metadata_html="<p>A successful Qodana run was found for workflow run <code>$QODANA_RUN_ID</code> at commit <code>$QODANA_HEAD_SHA</code>, but its report artifacts are currently unavailable. GitHub Pages will continue to publish the documentation site without hosted Qodana reports for that run.</p>"
  fi
fi

if [[ "$SERVICES_ARTIFACT_PRESENT" == 'unknown' || "$ORCHESTRATOR_ARTIFACT_PRESENT" == 'unknown' ]]; then
  status_notice_text='GitHub Pages could not determine artifact availability for the resolved Qodana run, so missing reports are shown as undetermined rather than unavailable.'
  status_notice_html='<p><strong>Note:</strong> GitHub Pages could not determine artifact availability for the resolved Qodana run, so missing reports are shown as undetermined rather than unavailable.</p>'
elif [[ "$SERVICES_DOWNLOAD_OUTCOME" == 'failure' || "$ORCHESTRATOR_DOWNLOAD_OUTCOME" == 'failure' ]]; then
  status_notice_text='At least one Qodana artifact existed for the resolved run but could not be downloaded. This usually indicates an artifact retrieval problem rather than a missing report.'
  status_notice_html='<p><strong>Note:</strong> At least one Qodana artifact existed for the resolved run but could not be downloaded. This usually indicates an artifact retrieval problem rather than a missing report.</p>'
fi

# ---------------------------------------------------------------------------
# 3. Log resolution
# ---------------------------------------------------------------------------

echo 'Qodana Pages report resolution:'
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

# ---------------------------------------------------------------------------
# 4. Publish reports into the Pages site
# ---------------------------------------------------------------------------

mkdir -p "$SITE_DIR/qodana/services-java" "$SITE_DIR/qodana/orchestrator" "$SITE_DIR/qodana/nextjs-dash"

write_html_file() {
  local target_path="$1"
  shift
  printf '%s\n' "$@" > "$target_path"
}

create_scope_page() {
  local scope_name="$1"
  local scope_dir="$SITE_DIR/qodana/$scope_name"
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
      "  <title>${scope_name} Qodana report</title>" \
      '</head>' \
      '<body>' \
      "  <p>Redirecting to the hosted Qodana report for <code>${scope_name}</code>...</p>" \
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
      "  <title>${scope_name} Qodana report</title>" \
      '  <style>' \
      '    body { font-family: Arial, sans-serif; margin: 2rem auto; max-width: 52rem; line-height: 1.6; padding: 0 1rem; }' \
      '    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }' \
      '  </style>' \
      '</head>' \
      '<body>' \
      "  <h1>${scope_name} Qodana report</h1>" \
      "  <p>${scope_message}</p>" \
      '  <p>Return to the <a href="../">main Qodana report index</a>.</p>' \
      '</body>' \
      '</html>'
  fi
}

# Copy downloaded report directories into the site tree.
if [[ -d "$QODANA_PAGES_DIR/services-java" ]]; then
  cp -a "$QODANA_PAGES_DIR/services-java/." "$SITE_DIR/qodana/services-java/"
fi

if [[ -d "$QODANA_PAGES_DIR/orchestrator" ]]; then
  cp -a "$QODANA_PAGES_DIR/orchestrator/." "$SITE_DIR/qodana/orchestrator/"
fi

# Copy the pre-generated Next.js quality report (index.html) into the site tree.
if [[ -d "$NEXTJS_QUALITY_PAGES_DIR/nextjs-dash" ]]; then
  cp -a "$NEXTJS_QUALITY_PAGES_DIR/nextjs-dash/." "$SITE_DIR/qodana/nextjs-dash/"
fi

create_scope_page 'services-java' "$services_item_text"
create_scope_page 'orchestrator' "$orchestrator_item_text"
create_scope_page 'nextjs-dash' "$nextjs_item_text"

# Landing page
write_html_file "$SITE_DIR/qodana/index.html" \
  '<!doctype html>' \
  '<html lang="en">' \
  '<head>' \
  '  <meta charset="utf-8">' \
  '  <meta name="viewport" content="width=device-width, initial-scale=1">' \
  '  <title>Quality reports</title>' \
  '  <style>' \
  '    body { font-family: Arial, sans-serif; margin: 2rem auto; max-width: 52rem; line-height: 1.6; padding: 0 1rem; }' \
  '    code { background: #f3f4f6; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }' \
  '    h2 { margin-top: 1.5rem; }' \
  '  </style>' \
  '</head>' \
  '<body>' \
  '  <h1>Quality reports</h1>' \
  '  <p>Latest published code-quality reports from GitHub Actions on <code>main</code>.</p>' \
  '  <h2>Qodana (JVM)</h2>' \
  '  <p>IntelliJ-based static analysis via <code>jetbrains/qodana-jvm-community</code>.</p>' \
  '  <ul>' \
  "    ${services_item_html}" \
  "    ${orchestrator_item_html}" \
  '  </ul>' \
  "  ${report_metadata_html}" \
  "  ${status_notice_html}" \
  '  <h2>Next.js Dashboard (ESLint + TypeScript)</h2>' \
  '  <p>ESLint and TypeScript strict-mode analysis — the free, open-source equivalent of JetBrains IDE inspections for JavaScript and TypeScript.</p>' \
  '  <ul>' \
  "    ${nextjs_item_html}" \
  '  </ul>' \
  "  ${nextjs_metadata_html}" \
  '</body>' \
  '</html>'

