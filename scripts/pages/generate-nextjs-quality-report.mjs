#!/usr/bin/env node
// scripts/pages/generate-nextjs-quality-report.mjs
//
// Generates a self-contained HTML quality report for the Next.js dashboard
// from ESLint JSON output and TypeScript compiler diagnostics.
//
// Designed as the free alternative to Qodana-JS for CI quality reporting.
//
// Usage (from utils/nextjs-dash working directory):
//   node ../../scripts/pages/generate-nextjs-quality-report.mjs
//
// Expected input files (in cwd):
//   eslint-report.json   – ESLint output (--format json)
//   tsc-output.txt       – TypeScript compiler output (tsc --noEmit 2>&1)
//
// Output:
//   quality-report/index.html
//
// Environment variables (optional, auto-detected in GitHub Actions):
//   GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY,
//   ESLINT_VERSION, TSC_VERSION, NODE_VERSION

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Read inputs
// ---------------------------------------------------------------------------

const cwd = process.cwd();

function readOptionalFile(name) {
  const p = resolve(cwd, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

const eslintRaw = readOptionalFile('eslint-report.json');
const tscRaw = readOptionalFile('tsc-output.txt');

/** @type {Array<{filePath:string, messages:Array<{ruleId:string|null, severity:number, message:string, line:number, column:number}>, errorCount:number, warningCount:number}>} */
let eslintResults = [];
try {
  if (eslintRaw) eslintResults = JSON.parse(eslintRaw);
} catch {
  console.warn('Warning: could not parse eslint-report.json; ESLint section will be empty.');
}

const tscLines = tscRaw
  ? tscRaw.split('\n').filter((l) => l.trim().length > 0)
  : [];

// ---------------------------------------------------------------------------
// 2. Compute summaries
// ---------------------------------------------------------------------------

const eslintTotalErrors = eslintResults.reduce((s, f) => s + f.errorCount, 0);
const eslintTotalWarnings = eslintResults.reduce((s, f) => s + f.warningCount, 0);
const eslintFilesWithIssues = eslintResults.filter(
  (f) => f.errorCount > 0 || f.warningCount > 0,
).length;
const eslintTotalFiles = eslintResults.length;
const eslintPass = eslintTotalErrors === 0 && eslintTotalWarnings === 0;

// TypeScript diagnostics: lines that match the pattern "file(line,col): error TSxxxx: ..."
const tscDiagnostics = tscLines.filter((l) => /:\s*(error|warning)\s+TS\d+/.test(l));
const tscErrorCount = tscLines.filter((l) => /:\s*error\s+TS\d+/.test(l)).length;
const tscWarningCount = tscLines.filter((l) => /:\s*warning\s+TS\d+/.test(l)).length;
const tscPass = tscErrorCount === 0;

const overallPass = eslintPass && tscPass;

// ---------------------------------------------------------------------------
// 3. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const nodeVersion = process.env.NODE_VERSION || process.version;
const eslintVersion = process.env.ESLINT_VERSION || '';
const tscVersion = process.env.TSC_VERSION || '';
const timestamp = new Date().toISOString();

// ---------------------------------------------------------------------------
// 4. HTML helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Shorten absolute file paths to project-relative. */
function shortPath(p) {
  try {
    const r = relative(cwd, p);
    return r.startsWith('..') ? p : r;
  } catch {
    return p;
  }
}

function severityBadge(sev) {
  if (sev === 2) return '<span class="badge badge-error">error</span>';
  if (sev === 1) return '<span class="badge badge-warn">warning</span>';
  return '<span class="badge">info</span>';
}

function statusIcon(pass) {
  return pass ? '✅' : '❌';
}

// ---------------------------------------------------------------------------
// 5. Build ESLint findings table
// ---------------------------------------------------------------------------

let eslintTableRows = '';
for (const file of eslintResults) {
  if (file.messages.length === 0) continue;
  const fp = esc(shortPath(file.filePath));
  for (const msg of file.messages) {
    eslintTableRows += `<tr>
      <td class="cell-file" title="${esc(file.filePath)}">${fp}</td>
      <td class="cell-loc">${msg.line}:${msg.column}</td>
      <td>${severityBadge(msg.severity)}</td>
      <td class="cell-rule">${esc(msg.ruleId || '—')}</td>
      <td>${esc(msg.message)}</td>
    </tr>\n`;
  }
}

// ---------------------------------------------------------------------------
// 6. Build TypeScript diagnostics block
// ---------------------------------------------------------------------------

let tscBlock = '';
if (tscDiagnostics.length > 0) {
  tscBlock = `<pre class="tsc-output">${tscDiagnostics.map((l) => esc(l)).join('\n')}</pre>`;
} else if (tscRaw === null) {
  tscBlock = '<p class="muted">TypeScript diagnostics file was not found.</p>';
} else {
  tscBlock = '<p class="muted">No TypeScript diagnostics — all checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 7. Metadata section
// ---------------------------------------------------------------------------

const metaParts = [];
if (repo && commitSha !== 'local') {
  metaParts.push(
    `Commit <code><a href="https://github.com/${esc(repo)}/commit/${esc(commitSha)}">${esc(commitSha.slice(0, 10))}</a></code>`,
  );
}
if (runId && repo) {
  metaParts.push(
    `Workflow run <code><a href="https://github.com/${esc(repo)}/actions/runs/${esc(runId)}">${esc(runId)}</a></code>`,
  );
}
metaParts.push(`Generated ${esc(timestamp)}`);
if (nodeVersion) metaParts.push(`Node ${esc(nodeVersion)}`);
if (eslintVersion) metaParts.push(`ESLint ${esc(eslintVersion)}`);
if (tscVersion) metaParts.push(`tsc ${esc(tscVersion)}`);

// ---------------------------------------------------------------------------
// 8. Assemble HTML
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Next.js Dashboard — Quality Report</title>
  <style>
    :root {
      --bg: #ffffff; --fg: #1a1a2e; --muted: #6e7781;
      --card-bg: #f6f8fa; --card-border: #d0d7de;
      --accent: #0969da; --error: #cf222e; --warn: #bf8700; --pass: #1a7f37;
      --table-stripe: #f6f8fa; --table-border: #d8dee4;
      --badge-error-bg: #cf222e; --badge-warn-bg: #bf8700;
      --pre-bg: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e;
        --card-bg: #161b22; --card-border: #30363d;
        --accent: #58a6ff; --error: #f85149; --warn: #d29922; --pass: #3fb950;
        --table-stripe: #161b22; --table-border: #30363d;
        --badge-error-bg: #da3633; --badge-warn-bg: #9e6a03;
        --pre-bg: #161b22;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      margin: 0; padding: 2rem 1rem;
      background: var(--bg); color: var(--fg);
      max-width: 72rem; margin-left: auto; margin-right: auto;
      line-height: 1.5;
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    h2 { margin: 2rem 0 0.75rem; font-size: 1.25rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.35rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: var(--card-bg); padding: 0.15rem 0.35rem; border-radius: 0.25rem; font-size: 0.9em; }

    .subtitle { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.95rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 0.5rem; padding: 1rem 1.25rem;
    }
    .card-title { font-weight: 600; margin-bottom: 0.25rem; font-size: 0.95rem; }
    .card-value { font-size: 1.6rem; font-weight: 700; }
    .card-detail { color: var(--muted); font-size: 0.85rem; margin-top: 0.25rem; }
    .status-pass { color: var(--pass); }
    .status-fail { color: var(--error); }

    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin: 0.5rem 0 1rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--table-border); }
    th { font-weight: 600; background: var(--card-bg); position: sticky; top: 0; }
    tbody tr:nth-child(even) { background: var(--table-stripe); }
    .cell-file { max-width: 22rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.82rem; }
    .cell-loc { font-family: monospace; white-space: nowrap; }
    .cell-rule { font-family: monospace; font-size: 0.82rem; white-space: nowrap; }

    .badge {
      display: inline-block; padding: 0.1rem 0.5rem; border-radius: 1rem;
      font-size: 0.75rem; font-weight: 600; color: #fff; text-transform: uppercase;
    }
    .badge-error { background: var(--badge-error-bg); }
    .badge-warn { background: var(--badge-warn-bg); }

    pre.tsc-output {
      background: var(--pre-bg); border: 1px solid var(--card-border);
      border-radius: 0.5rem; padding: 1rem; overflow-x: auto;
      font-size: 0.82rem; line-height: 1.6;
    }
    .muted { color: var(--muted); }
    .meta { color: var(--muted); font-size: 0.82rem; margin-top: 2rem; border-top: 1px solid var(--card-border); padding-top: 1rem; }
    .meta span + span::before { content: ' · '; }
    .back-link { margin-bottom: 1.5rem; font-size: 0.9rem; }
    .empty-state { color: var(--muted); font-style: italic; padding: 1.5rem 0; }
    .collapse-toggle { cursor: pointer; user-select: none; }
    .collapse-toggle::before { content: '▸ '; font-size: 0.85em; }
    .collapse-toggle[open]::before { content: '▾ '; }
  </style>
</head>
<body>
  <p class="back-link"><a href="../">← Back to quality reports index</a></p>
  <h1>Next.js Dashboard — Quality Report</h1>
  <p class="subtitle">
    Static analysis results from ESLint and TypeScript — the free, open-source
    equivalent of JetBrains IDE inspections for JavaScript and TypeScript.
  </p>

  <div class="summary-grid">
    <div class="card">
      <div class="card-title">Overall</div>
      <div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${overallPass ? 'Pass' : 'Fail'}</div>
    </div>
    <div class="card">
      <div class="card-title">ESLint</div>
      <div class="card-value ${eslintPass ? 'status-pass' : 'status-fail'}">${statusIcon(eslintPass)} ${eslintTotalErrors} errors, ${eslintTotalWarnings} warnings</div>
      <div class="card-detail">${eslintTotalFiles} files analyzed${eslintFilesWithIssues > 0 ? `, ${eslintFilesWithIssues} with issues` : ''}</div>
    </div>
    <div class="card">
      <div class="card-title">TypeScript</div>
      <div class="card-value ${tscPass ? 'status-pass' : 'status-fail'}">${statusIcon(tscPass)} ${tscErrorCount} errors${tscWarningCount > 0 ? `, ${tscWarningCount} warnings` : ''}</div>
      <div class="card-detail">Strict mode (tsc --noEmit)</div>
    </div>
  </div>

  <h2>ESLint Findings</h2>
  ${
    eslintTableRows
      ? `<div style="overflow-x:auto">
    <table>
      <thead><tr><th>File</th><th>Location</th><th>Severity</th><th>Rule</th><th>Message</th></tr></thead>
      <tbody>${eslintTableRows}</tbody>
    </table>
  </div>`
      : '<p class="empty-state">No ESLint findings — all checks passed.</p>'
  }

  <h2>TypeScript Diagnostics</h2>
  ${tscBlock}

  <div class="meta">
    ${metaParts.map((p) => `<span>${p}</span>`).join('\n    ')}
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// 9. Write output
// ---------------------------------------------------------------------------

const outDir = resolve(cwd, 'quality-report');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'index.html');
writeFileSync(outFile, html, 'utf-8');

const issueCount = eslintTotalErrors + eslintTotalWarnings + tscErrorCount + tscWarningCount;
console.log(
  `Quality report generated: ${outFile}  (${issueCount} total finding${issueCount !== 1 ? 's' : ''})`,
);

