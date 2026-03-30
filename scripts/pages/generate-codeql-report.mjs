#!/usr/bin/env node
// scripts/pages/generate-codeql-report.mjs
//
// Generates a self-contained HTML quality report from CodeQL SARIF output
// across all analyzed languages (java-kotlin, python, go, javascript-typescript).
//
// Designed to be run as part of the CodeQL GitHub Actions workflow, producing
// a hosted report published to GitHub Pages under /quality/codeql/.
//
// Usage (from repository root):
//   node scripts/pages/generate-codeql-report.mjs
//
// Expected input directory:
//   .codeql-sarif/              – directory containing per-language subdirectories
//     codeql-sarif-java-kotlin/ – contains *.sarif files
//     codeql-sarif-python/      – contains *.sarif files
//     ...
//
// Output:
//   codeql-quality-report/index.html
//
// Environment variables (optional, auto-detected in GitHub Actions):
//   GITHUB_SHA, GITHUB_RUN_ID, GITHUB_REPOSITORY

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Discover and read SARIF files
// ---------------------------------------------------------------------------

const rootDir = process.cwd();
const sarifInputDir = resolve(rootDir, '.codeql-sarif');

/** @type {Array<{language: string, sarif: object, file: string}>} */
const sarifEntries = [];

let inputMissing = false;
let parseFailed = false;

if (!existsSync(sarifInputDir)) {
  inputMissing = true;
  console.warn('Warning: .codeql-sarif/ directory not found; report will show as no input.');
} else {
  const subdirs = readdirSync(sarifInputDir).filter((d) => {
    const full = join(sarifInputDir, d);
    return existsSync(full) && statSync(full).isDirectory();
  });

  if (subdirs.length === 0) {
    inputMissing = true;
    console.warn('Warning: no SARIF subdirectories found in .codeql-sarif/; report will show as no input.');
  }

  for (const subdir of subdirs) {
    const language = subdir.replace(/^codeql-sarif-/, '');
    const dirPath = join(sarifInputDir, subdir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.sarif'));

    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const sarif = JSON.parse(raw);
        sarifEntries.push({ language, sarif, file });
      } catch (err) {
        parseFailed = true;
        console.warn(`Warning: could not parse ${filePath}: ${err.message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Extract findings from all SARIF runs
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   ruleId: string, level: string, message: string,
 *   file: string, startLine: number, startColumn: number,
 *   language: string
 * }} Finding
 */

/** @type {Finding[]} */
const allFindings = [];

/** @type {Map<string, {id: string, shortDescription: string, fullDescription: string, severity: string, tags: string[]}>} */
const rulesMap = new Map();

for (const entry of sarifEntries) {
  const runs = entry.sarif.runs || [];
  for (const run of runs) {
    // Collect rule metadata
    const tool = run.tool || {};
    const driver = tool.driver || {};
    const rules = driver.rules || [];
    for (const rule of rules) {
      if (!rulesMap.has(rule.id)) {
        rulesMap.set(rule.id, {
          id: rule.id,
          shortDescription: rule.shortDescription?.text || '',
          fullDescription: rule.fullDescription?.text || '',
          severity: rule.defaultConfiguration?.level || 'warning',
          tags: rule.properties?.tags || [],
        });
      }
    }

    // Collect results
    const results = run.results || [];
    for (const result of results) {
      const loc = result.locations?.[0]?.physicalLocation || {};
      const artifactLoc = loc.artifactLocation || {};
      const region = loc.region || {};

      allFindings.push({
        ruleId: result.ruleId || 'unknown',
        level: result.level || 'warning',
        message: result.message?.text || '',
        file: artifactLoc.uri || '',
        startLine: region.startLine || 0,
        startColumn: region.startColumn || 0,
        language: entry.language,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Compute summaries
// ---------------------------------------------------------------------------

const hasValidData = !inputMissing && !parseFailed && sarifEntries.length > 0;
const totalFindings = allFindings.length;

const errorCount = allFindings.filter((f) => f.level === 'error').length;
const warningCount = allFindings.filter((f) => f.level === 'warning').length;
const noteCount = allFindings.filter((f) => f.level === 'note').length;
const otherCount = totalFindings - errorCount - warningCount - noteCount;

const overallPass = hasValidData && totalFindings === 0;

let overallLabel = 'Pass';
let overallDetail = '';
if (inputMissing) {
  overallLabel = 'No Input';
  overallDetail = 'No SARIF files were found \u2014 CodeQL results are unknown.';
} else if (parseFailed && sarifEntries.length === 0) {
  overallLabel = 'Parse Error';
  overallDetail = 'SARIF files could not be parsed \u2014 CodeQL results are unknown.';
} else if (totalFindings > 0) {
  overallLabel = 'Findings';
}

// Group by language
const byLanguage = {};
for (const f of allFindings) {
  byLanguage[f.language] = (byLanguage[f.language] || 0) + 1;
}

// Group by rule
const byRule = {};
for (const f of allFindings) {
  byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
}

// Languages analyzed (from SARIF entries, even if 0 findings)
const analyzedLanguages = [...new Set(sarifEntries.map((e) => e.language))].sort();

// Unique files with findings
const filesWithFindings = new Set(allFindings.map((f) => f.file).filter(Boolean)).size;

// ---------------------------------------------------------------------------
// 4. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const timestamp = new Date().toISOString();

// ---------------------------------------------------------------------------
// 5. HTML helpers
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function levelBadge(level) {
  const l = (level || '').toLowerCase();
  if (l === 'error') return '<span class="badge badge-error">error</span>';
  if (l === 'warning') return '<span class="badge badge-warn">warning</span>';
  if (l === 'note') return '<span class="badge badge-note">note</span>';
  return '<span class="badge">info</span>';
}

function langBadge(lang) {
  const colors = {
    'java-kotlin': '#ED8B00',
    python: '#3776AB',
    go: '#00ADD8',
    'javascript-typescript': '#F7DF1E',
  };
  const color = colors[lang] || '#6e7781';
  return `<span class="badge" style="background:${color};color:${color === '#F7DF1E' ? '#1a1a2e' : '#fff'}">${esc(lang)}</span>`;
}

function statusIcon(pass) {
  return pass ? '\u2705' : '\u274C';
}

// ---------------------------------------------------------------------------
// 6. Build findings table
// ---------------------------------------------------------------------------

let findingTableRows = '';
// Sort: errors first, then warnings, then notes, then by file
const sortedFindings = [...allFindings].sort((a, b) => {
  const levelOrder = { error: 0, warning: 1, note: 2 };
  const la = levelOrder[a.level] ?? 3;
  const lb = levelOrder[b.level] ?? 3;
  if (la !== lb) return la - lb;
  return a.file.localeCompare(b.file) || a.startLine - b.startLine;
});

for (const f of sortedFindings) {
  findingTableRows += `<tr>
    <td class="cell-file" title="${esc(f.file)}">${esc(f.file)}</td>
    <td class="cell-loc">${f.startLine}:${f.startColumn}</td>
    <td>${levelBadge(f.level)}</td>
    <td>${langBadge(f.language)}</td>
    <td class="cell-rule">${esc(f.ruleId)}</td>
    <td>${esc(f.message)}</td>
  </tr>\n`;
}

// ---------------------------------------------------------------------------
// 7. Rule breakdown table
// ---------------------------------------------------------------------------

let ruleBreakdown;
if (Object.keys(byRule).length > 0) {
  const sorted = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  ruleBreakdown = '<table><thead><tr><th>Rule</th><th>Description</th><th>Findings</th></tr></thead><tbody>';
  for (const [ruleId, count] of sorted) {
    const rule = rulesMap.get(ruleId);
    const desc = rule ? esc(rule.shortDescription || rule.fullDescription || '') : '';
    ruleBreakdown += `<tr><td><code>${esc(ruleId)}</code></td><td>${desc}</td><td>${count}</td></tr>`;
  }
  ruleBreakdown += '</tbody></table>';
} else if (inputMissing) {
  ruleBreakdown = '<p class="muted">No SARIF files found \u2014 CodeQL output is unavailable.</p>';
} else if (parseFailed && sarifEntries.length === 0) {
  ruleBreakdown = '<p class="muted">SARIF files could not be parsed.</p>';
} else {
  ruleBreakdown = '<p class="muted">No findings \u2014 all CodeQL checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 8. Language breakdown table
// ---------------------------------------------------------------------------

let languageBreakdown;
if (analyzedLanguages.length > 0) {
  languageBreakdown = '<table><thead><tr><th>Language</th><th>Findings</th></tr></thead><tbody>';
  for (const lang of analyzedLanguages) {
    const count = byLanguage[lang] || 0;
    languageBreakdown += `<tr><td>${langBadge(lang)}</td><td>${count}</td></tr>`;
  }
  languageBreakdown += '</tbody></table>';
} else {
  languageBreakdown = '<p class="muted">No languages analyzed.</p>';
}

// ---------------------------------------------------------------------------
// 9. Metadata section
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
metaParts.push(`CodeQL v4.35.1`);
if (analyzedLanguages.length > 0) {
  metaParts.push(`Languages: ${analyzedLanguages.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 10. Assemble HTML
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Cpath d=%27M32 2L6 14v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V14Z%27 fill=%27%234695EB%27/%3E%3Cpath d=%27M28 40l-9-9 3.5-3.5L28 33l13.5-13.5L45 23Z%27 fill=%27%23fff%27/%3E%3C/svg%3E">
  <title>CodeQL \u2014 Security & Quality Report</title>
  <style>
    :root {
      --bg: #ffffff; --fg: #1a1a2e; --muted: #6e7781;
      --card-bg: #f6f8fa; --card-border: #d0d7de;
      --accent: #0969da; --error: #cf222e; --warn: #bf8700; --pass: #1a7f37;
      --note: #0550ae;
      --table-stripe: #f6f8fa; --table-border: #d8dee4;
      --badge-error-bg: #cf222e; --badge-warn-bg: #bf8700; --badge-note-bg: #0550ae;
      --pre-bg: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e;
        --card-bg: #161b22; --card-border: #30363d;
        --accent: #58a6ff; --error: #f85149; --warn: #d29922; --pass: #3fb950;
        --note: #58a6ff;
        --table-stripe: #161b22; --table-border: #30363d;
        --badge-error-bg: #da3633; --badge-warn-bg: #9e6a03; --badge-note-bg: #1f6feb;
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
    .badge-note { background: var(--badge-note-bg); }

    .muted { color: var(--muted); }
    .meta { color: var(--muted); font-size: 0.82rem; margin-top: 2rem; border-top: 1px solid var(--card-border); padding-top: 1rem; }
    .meta span + span::before { content: ' \\00b7  '; }
    .back-link { margin-bottom: 1.5rem; font-size: 0.9rem; }
    .empty-state { color: var(--muted); font-style: italic; padding: 1.5rem 0; }
  </style>
</head>
<body>
  <p class="back-link"><a href="../">\u2190 Back to quality reports index</a></p>
  <h1>CodeQL \u2014 Security & Quality Report</h1>
  <p class="subtitle">
    Automated security vulnerability detection and code quality analysis powered by
    <a href="https://codeql.github.com/">GitHub CodeQL</a> \u2014 semantic code analysis
    engine covering CWE patterns, injection flaws, data-flow vulnerabilities, and more.
  </p>

  <div class="summary-grid">
    <div class="card">
      <div class="card-title">Overall</div>
      <div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${overallLabel}</div>
      <div class="card-detail">${overallDetail}</div>
    </div>
    <div class="card">
      <div class="card-title">Findings</div>
      <div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${errorCount} errors, ${warningCount} warnings, ${noteCount} notes${otherCount > 0 ? `, ${otherCount} other` : ''}</div>
      <div class="card-detail">${totalFindings} total across ${filesWithFindings} file${filesWithFindings !== 1 ? 's' : ''}</div>
    </div>
    <div class="card">
      <div class="card-title">Languages</div>
      <div class="card-value">${analyzedLanguages.length}</div>
      <div class="card-detail">${analyzedLanguages.length > 0 ? analyzedLanguages.join(', ') : 'none'}</div>
    </div>
    <div class="card">
      <div class="card-title">Rules Triggered</div>
      <div class="card-value">${Object.keys(byRule).length}</div>
      <div class="card-detail">unique CodeQL rules with findings</div>
    </div>
  </div>

  <h2>Language Breakdown</h2>
  ${languageBreakdown}

  <h2>Rule Breakdown</h2>
  ${ruleBreakdown}

  <h2>All Findings</h2>
  ${
    findingTableRows
      ? `<div style="overflow-x:auto">
    <table>
      <thead><tr><th>File</th><th>Location</th><th>Level</th><th>Language</th><th>Rule</th><th>Message</th></tr></thead>
      <tbody>${findingTableRows}</tbody>
    </table>
  </div>`
      : inputMissing
        ? '<p class="empty-state">No findings available \u2014 no SARIF files were found.</p>'
        : parseFailed && sarifEntries.length === 0
          ? '<p class="empty-state">No findings available \u2014 SARIF files could not be parsed.</p>'
          : '<p class="empty-state">No findings \u2014 all CodeQL checks passed across all languages. \u{1F389}</p>'
  }

  <div class="meta">
    ${metaParts.map((p) => `<span>${p}</span>`).join('\n    ')}
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// 11. Write output
// ---------------------------------------------------------------------------

const outDir = resolve(rootDir, 'codeql-quality-report');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'index.html');
writeFileSync(outFile, html, 'utf-8');

console.log(
  `CodeQL quality report generated: ${outFile}  (${totalFindings} total finding${totalFindings !== 1 ? 's' : ''} across ${analyzedLanguages.length} language${analyzedLanguages.length !== 1 ? 's' : ''})`,
);

