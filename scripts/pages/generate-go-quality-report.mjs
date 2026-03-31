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

import { resolve } from 'node:path';
import {
  esc, statusIcon, shortPath, readOptionalFile,
  buildMetaParts, renderMeta, htmlPage, writeReport,
} from './report-helpers.mjs';

// ---------------------------------------------------------------------------
// 1. Read inputs
// ---------------------------------------------------------------------------

const cwd = process.cwd();

const lintRaw = readOptionalFile(cwd, 'golangci-lint-report.json');

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
// 3. Severity badge (Go-specific: string-based severity)
// ---------------------------------------------------------------------------

function severityBadge(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'error') return '<span class="badge badge-error">error</span>';
  if (s === 'warning') return '<span class="badge badge-warn">warning</span>';
  return '<span class="badge">info</span>';
}

// ---------------------------------------------------------------------------
// 4. Build findings table
// ---------------------------------------------------------------------------

let issueTableRows = '';
for (const issue of issues) {
  const fp = esc(shortPath(cwd, issue.Pos?.Filename || ''));
  const line = issue.Pos?.Line || 0;
  const col = issue.Pos?.Column || 0;
  issueTableRows += '<tr>'
    + `<td class="cell-file" title="${esc(issue.Pos?.Filename || '')}">${fp}</td>`
    + `<td class="cell-loc">${line}:${col}</td>`
    + `<td>${severityBadge(issue.Severity)}</td>`
    + `<td class="cell-rule">${esc(issue.FromLinter || '\u2014')}</td>`
    + `<td>${esc(issue.Text || '')}</td>`
    + '</tr>\n';
}

// ---------------------------------------------------------------------------
// 5. Linter breakdown
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
// 6. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const goVersion = process.env.GO_VERSION || '';
const golangciLintVersion = process.env.GOLANGCI_LINT_VERSION || '';
const timestamp = new Date().toISOString();

const metaExtras = [];
if (goVersion) metaExtras.push(`${esc(goVersion)}`);
if (golangciLintVersion) metaExtras.push(`golangci-lint ${esc(golangciLintVersion)}`);

const metaParts = buildMetaParts({ repo, commitSha, runId, timestamp, extras: metaExtras });

// ---------------------------------------------------------------------------
// 7. Findings section
// ---------------------------------------------------------------------------

let findingsSection;
if (issueTableRows) {
  findingsSection = '<div style="overflow-x:auto">'
    + '<table>'
    + '<thead><tr><th>File</th><th>Location</th><th>Severity</th><th>Linter</th><th>Message</th></tr></thead>'
    + `<tbody>${issueTableRows}</tbody>`
    + '</table></div>';
} else if (inputMissing) {
  findingsSection = '<p class="empty-state">No findings available \u2014 golangci-lint-report.json was not found.</p>';
} else if (parseFailed) {
  findingsSection = '<p class="empty-state">No findings available \u2014 golangci-lint-report.json could not be parsed.</p>';
} else {
  findingsSection = '<p class="empty-state">No findings \u2014 all golangci-lint checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 8. Assemble HTML
// ---------------------------------------------------------------------------

const passClass = overallPass ? 'status-pass' : 'status-fail';

const body = [
  '  <h1>Go Enhanced Service \u2014 Quality Report</h1>',
  '  <p class="subtitle">',
  '    Static analysis results from <code>golangci-lint</code> \u2014 a fast, parallel Go linter',
  '    aggregating dozens of analyzers including <code>govet</code>, <code>staticcheck</code>,',
  '    <code>errcheck</code>, <code>gosec</code>, <code>revive</code>, and more.',
  '  </p>',
  '',
  '  <div class="summary-grid">',
  '    <div class="card">',
  '      <div class="card-title">Overall</div>',
  `      <div class="card-value ${passClass}">${statusIcon(overallPass)} ${overallLabel}</div>`,
  `      <div class="card-detail">${overallDetail}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">golangci-lint</div>',
  `      <div class="card-value ${passClass}">${statusIcon(overallPass)} ${errorCount} errors, ${warningCount} warnings${otherCount > 0 ? `, ${otherCount} other` : ''}</div>`,
  `      <div class="card-detail">${totalIssues} total issues across ${filesWithIssues} file${filesWithIssues !== 1 ? 's' : ''}</div>`,
  '    </div>',
  '  </div>',
  '',
  '  <h2>Linter Breakdown</h2>',
  `  ${linterBreakdown}`,
  '',
  '  <h2>All Findings</h2>',
  `  ${findingsSection}`,
  '',
  `  ${renderMeta(metaParts)}`,
].join('\n');

const html = htmlPage({
  title: 'Go Services \u2014 Quality Report',
  body,
});

// ---------------------------------------------------------------------------
// 9. Write output
// ---------------------------------------------------------------------------

const outFile = writeReport(resolve(cwd, 'quality-report'), html);

console.log(
  `Quality report generated: ${outFile}  (${totalIssues} total finding${totalIssues !== 1 ? 's' : ''})`,
);

