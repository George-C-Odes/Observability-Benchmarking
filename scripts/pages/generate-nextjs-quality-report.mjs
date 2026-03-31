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

import { resolve } from 'node:path';
import {
  esc, statusIcon, shortPath, readOptionalFile,
  buildMetaParts, renderMeta, htmlPage, writeReport,
} from './report-helpers.mjs';

// ---------------------------------------------------------------------------
// 1. Read inputs
// ---------------------------------------------------------------------------

const cwd = process.cwd();

const eslintRaw = readOptionalFile(cwd, 'eslint-report.json');
const tscRaw = readOptionalFile(cwd, 'tsc-output.txt');

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
// 3. Severity badge (Next.js-specific: numeric severity from ESLint)
// ---------------------------------------------------------------------------

function severityBadge(sev) {
  if (sev === 2) return '<span class="badge badge-error">error</span>';
  if (sev === 1) return '<span class="badge badge-warn">warning</span>';
  return '<span class="badge">info</span>';
}

// ---------------------------------------------------------------------------
// 4. Build ESLint findings table
// ---------------------------------------------------------------------------

let eslintTableRows = '';
for (const file of eslintResults) {
  if (file.messages.length === 0) continue;
  const fp = esc(shortPath(cwd, file.filePath));
  for (const msg of file.messages) {
    eslintTableRows += '<tr>'
      + `<td class="cell-file" title="${esc(file.filePath)}">${fp}</td>`
      + `<td class="cell-loc">${msg.line}:${msg.column}</td>`
      + `<td>${severityBadge(msg.severity)}</td>`
      + `<td class="cell-rule">${esc(msg.ruleId || '\u2014')}</td>`
      + `<td>${esc(msg.message)}</td>`
      + '</tr>\n';
  }
}

// ---------------------------------------------------------------------------
// 5. Build TypeScript diagnostics block
// ---------------------------------------------------------------------------

let tscBlock;
if (tscDiagnostics.length > 0) {
  tscBlock = `<pre class="tsc-output">${tscDiagnostics.map((l) => esc(l)).join('\n')}</pre>`;
} else if (tscRaw === null) {
  tscBlock = '<p class="muted">TypeScript diagnostics file was not found.</p>';
} else {
  tscBlock = '<p class="muted">No TypeScript diagnostics \u2014 all checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 6. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const nodeVersion = process.env.NODE_VERSION || process.version;
const eslintVersion = process.env.ESLINT_VERSION || '';
const tscVersion = process.env.TSC_VERSION || '';
const timestamp = new Date().toISOString();

const metaExtras = [];
if (nodeVersion) metaExtras.push(`Node ${esc(nodeVersion)}`);
if (eslintVersion) metaExtras.push(`ESLint ${esc(eslintVersion)}`);
if (tscVersion) metaExtras.push(`tsc ${esc(tscVersion)}`);

const metaParts = buildMetaParts({ repo, commitSha, runId, timestamp, extras: metaExtras });

// ---------------------------------------------------------------------------
// 7. ESLint findings section
// ---------------------------------------------------------------------------

let eslintSection;
if (eslintTableRows) {
  eslintSection = '<div style="overflow-x:auto">'
    + '<table>'
    + '<thead><tr><th>File</th><th>Location</th><th>Severity</th><th>Rule</th><th>Message</th></tr></thead>'
    + `<tbody>${eslintTableRows}</tbody>`
    + '</table></div>';
} else {
  eslintSection = '<p class="empty-state">No ESLint findings \u2014 all checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 8. Report-specific CSS
// ---------------------------------------------------------------------------

const extraCSS = [
  '    pre.tsc-output {',
  '      background: var(--pre-bg); border: 1px solid var(--card-border);',
  '      border-radius: 0.5rem; padding: 1rem; overflow-x: auto;',
  '      font-size: 0.82rem; line-height: 1.6;',
  '    }',
  '    .collapse-toggle { cursor: pointer; user-select: none; }',
  '    .collapse-toggle::before { content: \'\\25b8 \'; font-size: 0.85em; }',
  '    .collapse-toggle[open]::before { content: \'\\25be \'; }',
].join('\n');

// ---------------------------------------------------------------------------
// 9. Assemble HTML
// ---------------------------------------------------------------------------

const eslintPassClass = eslintPass ? 'status-pass' : 'status-fail';
const tscPassClass = tscPass ? 'status-pass' : 'status-fail';
const overallPassClass = overallPass ? 'status-pass' : 'status-fail';

const body = [
  '  <h1>Next.js Dashboard \u2014 Quality Report</h1>',
  '  <p class="subtitle">',
  '    Static analysis results from ESLint and TypeScript \u2014 the free, open-source',
  '    equivalent of JetBrains IDE inspections for JavaScript and TypeScript.',
  '  </p>',
  '',
  '  <div class="summary-grid">',
  '    <div class="card">',
  '      <div class="card-title">Overall</div>',
  `      <div class="card-value ${overallPassClass}">${statusIcon(overallPass)} ${overallPass ? 'Pass' : 'Fail'}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">ESLint</div>',
  `      <div class="card-value ${eslintPassClass}">${statusIcon(eslintPass)} ${eslintTotalErrors} errors, ${eslintTotalWarnings} warnings</div>`,
  `      <div class="card-detail">${eslintTotalFiles} files analyzed${eslintFilesWithIssues > 0 ? `, ${eslintFilesWithIssues} with issues` : ''}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">TypeScript</div>',
  `      <div class="card-value ${tscPassClass}">${statusIcon(tscPass)} ${tscErrorCount} errors${tscWarningCount > 0 ? `, ${tscWarningCount} warnings` : ''}</div>`,
  '      <div class="card-detail">Strict mode (tsc --noEmit)</div>',
  '    </div>',
  '  </div>',
  '',
  '  <h2>ESLint Findings</h2>',
  `  ${eslintSection}`,
  '',
  '  <h2>TypeScript Diagnostics</h2>',
  `  ${tscBlock}`,
  '',
  `  ${renderMeta(metaParts)}`,
].join('\n');

const html = htmlPage({
  title: 'Next.js Dashboard \u2014 Quality Report',
  extraCSS,
  body,
});

// ---------------------------------------------------------------------------
// 10. Write output
// ---------------------------------------------------------------------------

const outFile = writeReport(resolve(cwd, 'quality-report'), html);

const issueCount = eslintTotalErrors + eslintTotalWarnings + tscErrorCount + tscWarningCount;
console.log(
  `Quality report generated: ${outFile}  (${issueCount} total finding${issueCount !== 1 ? 's' : ''})`,
);

