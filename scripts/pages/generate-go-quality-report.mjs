#!/usr/bin/env node
// scripts/pages/generate-go-quality-report.mjs
//
// Generates a self-contained HTML quality report for the Go Enhanced service
// from golangci-lint JSON output.
//
// Designed as the free alternative to Qodana-Go for CI quality reporting.
//
// Usage (from services/go/enhanced working directory):
//   node ../../../scripts/pages/generate-go-quality-report.mjs
//
// Expected input files (in cwd):
//   golangci-lint-report.json  – golangci-lint output (--out-format=json)
//
// Output:
//   quality-report/index.html
//
// Environment variables (optional, auto-detected in GitHub Actions):
//   GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY,
//   GOLANGCI_LINT_VERSION, GO_VERSION

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

const lintRaw = readOptionalFile('golangci-lint-report.json');

/** @type {{Issues?: Array<{FromLinter:string, Text:string, Pos:{Filename:string,Line:number,Column:number},Severity:string}>}} */
let lintReport = {};

// Track input health so a missing or corrupt report file cannot produce a
// false "Pass" on the hosted HTML page.
let inputMissing = lintRaw === null;
let parseFailed = false;

try {
  if (lintRaw) lintReport = JSON.parse(lintRaw);
} catch (err) {
  parseFailed = true;
  console.warn(`Warning: could not parse golangci-lint-report.json: ${err.message}; report will show as failed.`);
}

const issues = lintReport.Issues || [];

// ---------------------------------------------------------------------------
// 2. Compute summaries
// ---------------------------------------------------------------------------

const hasValidLintData = !inputMissing && !parseFailed;
const totalIssues = issues.length;
const errorCount = issues.filter((i) => (i.Severity || '').toLowerCase() === 'error').length;
const warningCount = issues.filter((i) => (i.Severity || '').toLowerCase() === 'warning').length;
const otherCount = totalIssues - errorCount - warningCount;

// A clean pass requires valid input AND zero issues.
const overallPass = hasValidLintData && totalIssues === 0;

// Human-readable status label for the Overall card.
let overallLabel = 'Pass';
let overallDetail = '';
if (inputMissing) {
  overallLabel = 'No Input';
  overallDetail = 'golangci-lint-report.json was not found \u2014 results are unknown.';
} else if (parseFailed) {
  overallLabel = 'Parse Error';
  overallDetail = 'golangci-lint-report.json could not be parsed \u2014 results are unknown.';
} else if (totalIssues > 0) {
  overallLabel = 'Fail';
}

// Group by linter
const byLinter = {};
for (const issue of issues) {
  const linter = issue.FromLinter || 'unknown';
  byLinter[linter] = (byLinter[linter] || 0) + 1;
}

// Unique files with issues
const filesWithIssues = new Set(issues.map((i) => i.Pos?.Filename).filter(Boolean)).size;

// ---------------------------------------------------------------------------
// 3. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const goVersion = process.env.GO_VERSION || '';
const golangciLintVersion = process.env.GOLANGCI_LINT_VERSION || '';
const timestamp = new Date().toISOString();

// ---------------------------------------------------------------------------
// 4. HTML helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortPath(p) {
  try {
    const r = relative(cwd, p);
    return r.startsWith('..') ? p : r;
  } catch {
    return p;
  }
}

function severityBadge(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'error') return '<span class="badge badge-error">error</span>';
  if (s === 'warning') return '<span class="badge badge-warn">warning</span>';
  return '<span class="badge">info</span>';
}

function statusIcon(pass) {
  return pass ? '\u2705' : '\u274C';
}

// ---------------------------------------------------------------------------
// 5. Build findings table
// ---------------------------------------------------------------------------

let issueTableRows = '';
for (const issue of issues) {
  const fp = esc(shortPath(issue.Pos?.Filename || ''));
  const line = issue.Pos?.Line || 0;
  const col = issue.Pos?.Column || 0;
  issueTableRows += `<tr>
    <td class="cell-file" title="${esc(issue.Pos?.Filename || '')}">${fp}</td>
    <td class="cell-loc">${line}:${col}</td>
    <td>${severityBadge(issue.Severity)}</td>
    <td class="cell-rule">${esc(issue.FromLinter || '\u2014')}</td>
    <td>${esc(issue.Text || '')}</td>
  </tr>\n`;
}

// ---------------------------------------------------------------------------
// 6. Linter breakdown
// ---------------------------------------------------------------------------

let linterBreakdown;
if (Object.keys(byLinter).length > 0) {
  const sorted = Object.entries(byLinter).sort((a, b) => b[1] - a[1]);
  linterBreakdown = '<table><thead><tr><th>Linter</th><th>Issues</th></tr></thead><tbody>';
  for (const [linter, count] of sorted) {
    linterBreakdown += `<tr><td><code>${esc(linter)}</code></td><td>${count}</td></tr>`;
  }
  linterBreakdown += '</tbody></table>';
} else if (inputMissing) {
  linterBreakdown = '<p class="muted">No linter output \u2014 golangci-lint-report.json was not found.</p>';
} else if (parseFailed) {
  linterBreakdown = '<p class="muted">No linter output \u2014 golangci-lint-report.json could not be parsed.</p>';
} else {
  linterBreakdown = '<p class="muted">No issues found \u2014 all linters passed.</p>';
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
if (goVersion) metaParts.push(`${esc(goVersion)}`);
if (golangciLintVersion) metaParts.push(`golangci-lint ${esc(golangciLintVersion)}`);

// ---------------------------------------------------------------------------
// 8. Assemble HTML
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Go Services \u2014 Quality Report</title>
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

    .muted { color: var(--muted); }
    .meta { color: var(--muted); font-size: 0.82rem; margin-top: 2rem; border-top: 1px solid var(--card-border); padding-top: 1rem; }
    .meta span + span::before { content: ' \\00b7  '; }
    .back-link { margin-bottom: 1.5rem; font-size: 0.9rem; }
    .empty-state { color: var(--muted); font-style: italic; padding: 1.5rem 0; }
  </style>
</head>
<body>
  <p class="back-link"><a href="../">\u2190 Back to quality reports index</a></p>
  <h1>Go Enhanced Service \u2014 Quality Report</h1>
  <p class="subtitle">
    Static analysis results from <code>golangci-lint</code> \u2014 a fast, parallel Go linter
    aggregating dozens of analyzers including <code>govet</code>, <code>staticcheck</code>,
    <code>errcheck</code>, <code>gosec</code>, <code>revive</code>, and more.
  </p>

  <div class="summary-grid">
    <div class="card">
      <div class="card-title">Overall</div>
      <div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${overallLabel}</div>
      <div class="card-detail">${overallDetail}</div>
    </div>
    <div class="card">
      <div class="card-title">golangci-lint</div>
      <div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${errorCount} errors, ${warningCount} warnings${otherCount > 0 ? `, ${otherCount} other` : ''}</div>
      <div class="card-detail">${totalIssues} total issues across ${filesWithIssues} file${filesWithIssues !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <h2>Linter Breakdown</h2>
  ${linterBreakdown}

  <h2>All Findings</h2>
  ${
    issueTableRows
      ? `<div style="overflow-x:auto">
    <table>
      <thead><tr><th>File</th><th>Location</th><th>Severity</th><th>Linter</th><th>Message</th></tr></thead>
      <tbody>${issueTableRows}</tbody>
    </table>
  </div>`
      : inputMissing
        ? '<p class="empty-state">No findings available \u2014 golangci-lint-report.json was not found.</p>'
        : parseFailed
          ? '<p class="empty-state">No findings available \u2014 golangci-lint-report.json could not be parsed.</p>'
          : '<p class="empty-state">No findings \u2014 all golangci-lint checks passed.</p>'
  }

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

console.log(
  `Quality report generated: ${outFile}  (${totalIssues} total finding${totalIssues !== 1 ? 's' : ''})`,
);
