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

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  esc, statusIcon,
  buildMetaParts, renderMeta, htmlPage, writeReport,
} from './report-helpers.mjs';

// ---------------------------------------------------------------------------
// 1. Discover and read SARIF files
// ---------------------------------------------------------------------------

const rootDir = process.cwd();
const sarifInputDir = resolve(rootDir, '.codeql-sarif');

/** @type {Array<{language: string, sarif: object, file: string}>} */
const sarifEntries = [];

let inputMissing = false;
let parseFailed = false;
let parseFailCount = 0;

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
        parseFailCount++;
        console.warn(`Warning: could not parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 1b. Discover and read build warnings (checkstyle violations, etc.)
// ---------------------------------------------------------------------------

const buildWarningsDir = resolve(rootDir, '.codeql-build-warnings');

/** @type {{modulesChecked: number, modulesFailed: number, warnings: string[]}} */
let buildWarnings = { modulesChecked: 0, modulesFailed: 0, warnings: [] };
let buildWarningsParseFailed = false;

const buildWarningsFile = join(buildWarningsDir, 'codeql-build-warnings.json');
if (existsSync(buildWarningsFile)) {
  try {
    const raw = readFileSync(buildWarningsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const warningsArr = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    const rawChecked = Number(parsed.modulesChecked);
    const rawFailed = Number(parsed.modulesFailed);
    const modulesFailed = Number.isFinite(rawFailed) ? rawFailed : 0;
    const modulesChecked = Number.isFinite(rawChecked)
      ? rawChecked
      : Number.isFinite(rawFailed)
        ? rawFailed
        : (warningsArr.length > 0 ? warningsArr.length : 0);
    buildWarnings = {
      modulesChecked,
      modulesFailed,
      warnings: warningsArr,
    };
    if (buildWarnings.warnings.length > 0) {
      console.log(`Build warnings loaded: ${buildWarnings.warnings.length} warning(s) from ${buildWarningsFile}`);
    }
  } catch (err) {
    buildWarningsParseFailed = true;
    console.warn(`Warning: could not parse ${buildWarningsFile}: ${err instanceof Error ? err.message : String(err)}`);
  }
} else {
  console.log('No build-warnings artifact found; checkstyle results will not be shown.');
}

// Treat build warnings as present when either the warnings array has entries
// OR modulesFailed > 0 (guards against a producer that sets the count but
// omits/truncates the warnings list).
const hasBuildWarnings = buildWarnings.warnings.length > 0 || buildWarnings.modulesFailed > 0;

if (buildWarnings.modulesFailed > 0 && buildWarnings.warnings.length === 0) {
  console.warn(
    `Warning: modulesFailed=${buildWarnings.modulesFailed} but warnings array is empty \u2014 ` +
    'the JSON producer may have omitted failure details.',
  );
} else if (buildWarnings.modulesFailed === 0 && buildWarnings.warnings.length > 0) {
  console.warn(
    `Warning: warnings array has ${buildWarnings.warnings.length} entries but modulesFailed=0 \u2014 ` +
    'inconsistent build-warnings JSON.',
  );
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

// hasValidData is true when at least one SARIF file was successfully parsed,
// even if other files failed.  This lets partial results surface findings
// while a separate flag (parseFailed) drives the warning UI.
const hasValidData = !inputMissing && sarifEntries.length > 0;
const totalFindings = allFindings.length;

const errorCount = allFindings.filter((f) => f.level === 'error').length;
const warningCount = allFindings.filter((f) => f.level === 'warning').length;
const noteCount = allFindings.filter((f) => f.level === 'note').length;
const otherCount = totalFindings - errorCount - warningCount - noteCount;

// A clean pass requires valid input, zero findings, no parse errors,
// no build warnings (e.g. checkstyle violations), AND no build-warnings
// parse failures (a malformed JSON means we cannot trust the result).
const overallPass = hasValidData && !parseFailed && !buildWarningsParseFailed && totalFindings === 0 && !hasBuildWarnings;

let overallLabel = 'Pass';
let overallDetail = '';
if (inputMissing) {
  overallLabel = 'No Input';
  overallDetail = 'No SARIF files were found \u2014 CodeQL results are unknown.';
} else if (parseFailed && sarifEntries.length === 0) {
  overallLabel = 'Parse Error';
  overallDetail = 'SARIF files could not be parsed \u2014 CodeQL results are unknown.';
} else if (parseFailed) {
  overallLabel = totalFindings > 0 ? 'Findings' : 'Partial Parse Error';
  overallDetail =
    `${parseFailCount} SARIF file${parseFailCount !== 1 ? 's' : ''} could not be parsed` +
    ' \u2014 results may be incomplete.';
} else if (buildWarningsParseFailed) {
  overallLabel = totalFindings > 0 ? 'Findings + Build Warning Parse Error' : 'Build Warning Parse Error';
  overallDetail =
    'The build-warnings file (codeql-build-warnings.json) could not be parsed \u2014 ' +
    'checkstyle results are unknown.';
} else if (totalFindings > 0 && hasBuildWarnings) {
  overallLabel = 'Findings + Build Warnings';
  overallDetail =
    `${buildWarnings.modulesFailed} of ${buildWarnings.modulesChecked} Java module${buildWarnings.modulesChecked !== 1 ? 's' : ''} ` +
    'failed checkstyle; CodeQL also reported findings.';
} else if (totalFindings > 0) {
  overallLabel = 'Findings';
} else if (hasBuildWarnings) {
  overallLabel = 'Build Warnings';
  overallDetail =
    `${buildWarnings.modulesFailed} of ${buildWarnings.modulesChecked} Java module${buildWarnings.modulesChecked !== 1 ? 's' : ''} ` +
    'failed checkstyle validation.';
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

// Languages analyzed (from SARIF entries, even if 0 findings).
const languageDisplayOrder = ['java-kotlin', 'go', 'python', 'javascript-typescript'];
const analyzedLanguages = [...new Set(sarifEntries.map((e) => e.language))].sort((a, b) => {
  const ia = languageDisplayOrder.indexOf(a);
  const ib = languageDisplayOrder.indexOf(b);
  return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib) || a.localeCompare(b);
});

// Unique files with findings
const filesWithFindings = new Set(allFindings.map((f) => f.file).filter(Boolean)).size;

// ---------------------------------------------------------------------------
// 4. CodeQL-specific HTML helpers
// ---------------------------------------------------------------------------

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
  const textColor = color === '#F7DF1E' ? '#1a1a2e' : '#fff';
  return `<span class="badge" style="background:${color};color:${textColor}">${esc(lang)}</span>`;
}

// ---------------------------------------------------------------------------
// 5. Build findings table
// ---------------------------------------------------------------------------

let findingTableRows = '';
const sortedFindings = [...allFindings].sort((a, b) => {
  const levelOrder = { error: 0, warning: 1, note: 2 };
  const la = levelOrder[a.level] ?? 3;
  const lb = levelOrder[b.level] ?? 3;
  if (la !== lb) return la - lb;
  return a.file.localeCompare(b.file) || a.startLine - b.startLine;
});

for (const f of sortedFindings) {
  findingTableRows += '<tr>'
    + `<td class="cell-file" title="${esc(f.file)}">${esc(f.file)}</td>`
    + `<td class="cell-loc">${f.startLine}:${f.startColumn}</td>`
    + `<td>${levelBadge(f.level)}</td>`
    + `<td>${langBadge(f.language)}</td>`
    + `<td class="cell-rule">${esc(f.ruleId)}</td>`
    + `<td>${esc(f.message)}</td>`
    + '</tr>\n';
}

// ---------------------------------------------------------------------------
// 6. Rule breakdown table
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
} else if (parseFailed) {
  ruleBreakdown = '<p class="muted">No findings from successfully parsed files, but '
    + `${parseFailCount} file${parseFailCount !== 1 ? 's' : ''} could not be parsed \u2014 results may be incomplete.</p>`;
} else {
  ruleBreakdown = '<p class="muted">No findings \u2014 all CodeQL checks passed.</p>';
}

// ---------------------------------------------------------------------------
// 7. Language breakdown table
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
// 8. Build warnings section (checkstyle violations, etc.)
// ---------------------------------------------------------------------------

let buildWarningsHtml = '';
if (buildWarningsParseFailed) {
  buildWarningsHtml = '<div class="warnings-box warnings-box-error">'
    + '<h2>\u274C Build Warning Parse Error</h2>'
    + '<p>The build-warnings file (<code>codeql-build-warnings.json</code>) was found but could not be '
    + 'parsed. Checkstyle results are unknown &mdash; treat this as a failure until the file is fixed.</p>'
    + '</div>';
} else if (hasBuildWarnings) {
  const items = buildWarnings.warnings.map((w) => `<li>${esc(w)}</li>`).join('\n        ');
  const listHtml = items
    ? `<ul>${items}</ul>`
    : '<p class="muted">No per-module details were provided by the build step.</p>';
  const modLabel = buildWarnings.modulesChecked !== 1 ? 's' : '';
  buildWarningsHtml = '<div class="warnings-box">'
    + '<h2>\u26A0\uFE0F Build Warnings</h2>'
    + `<p><strong>${buildWarnings.modulesFailed}</strong> of <strong>${buildWarnings.modulesChecked}</strong> Java module${modLabel} failed checkstyle validation.</p>`
    + listHtml
    + '</div>';
}

// ---------------------------------------------------------------------------
// 9. Metadata
// ---------------------------------------------------------------------------

const commitSha = process.env.GITHUB_SHA || 'local';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const timestamp = new Date().toISOString();

const metaExtras = [];
const codeqlVersion = process.env.CODEQL_VERSION;
metaExtras.push(codeqlVersion ? `CodeQL ${esc(codeqlVersion)}` : 'CodeQL');
if (analyzedLanguages.length > 0) {
  metaExtras.push(`Languages: ${analyzedLanguages.join(', ')}`);
}

const metaParts = buildMetaParts({ repo, commitSha, runId, timestamp, extras: metaExtras });

// ---------------------------------------------------------------------------
// 10. Findings section
// ---------------------------------------------------------------------------

let findingsSection;
if (findingTableRows) {
  findingsSection = '<div style="overflow-x:auto">'
    + '<table>'
    + '<thead><tr><th>File</th><th>Location</th><th>Level</th><th>Language</th><th>Rule</th><th>Message</th></tr></thead>'
    + `<tbody>${findingTableRows}</tbody>`
    + '</table></div>';
} else if (inputMissing) {
  findingsSection = '<p class="empty-state">No findings available \u2014 no SARIF files were found.</p>';
} else if (parseFailed && sarifEntries.length === 0) {
  findingsSection = '<p class="empty-state">No findings available \u2014 SARIF files could not be parsed.</p>';
} else if (parseFailed) {
  findingsSection = `<p class="empty-state">No findings from successfully parsed files, but ${parseFailCount} file${parseFailCount !== 1 ? 's' : ''} could not be parsed \u2014 results may be incomplete.</p>`;
} else {
  findingsSection = '<p class="empty-state">No findings \u2014 all CodeQL checks passed across all languages. \u{1F389}</p>';
}

// ---------------------------------------------------------------------------
// 11. Report-specific CSS
// ---------------------------------------------------------------------------

const extraCSS = [
  '    .warnings-box {',
  '      background: color-mix(in srgb, var(--warn) 10%, var(--bg));',
  '      border: 1px solid var(--warn); border-radius: 0.5rem;',
  '      padding: 0.75rem 1.25rem; margin-bottom: 1.5rem;',
  '    }',
  '    .warnings-box h2 { border-bottom: none; margin-top: 0.5rem; }',
  '    .warnings-box ul { margin: 0.5rem 0 0.25rem; padding-left: 1.5rem; }',
  '    .warnings-box li { font-family: monospace; font-size: 0.9rem; margin-bottom: 0.25rem; }',
  '    .warnings-box-error { border-color: var(--error); }',
].join('\n');

// ---------------------------------------------------------------------------
// 12. Assemble HTML
// ---------------------------------------------------------------------------

const passClass = overallPass ? 'status-pass' : 'status-fail';

const body = [
  '  <h1>CodeQL \u2014 Security & Quality Report</h1>',
  '  <p class="subtitle">',
  '    Automated security vulnerability detection and code quality analysis powered by',
  '    <a href="https://codeql.github.com/">GitHub CodeQL</a> \u2014 semantic code analysis',
  '    engine covering CWE patterns, injection flaws, data-flow vulnerabilities, and more.',
  '  </p>',
  '',
  '  <div class="summary-grid">',
  '    <div class="card">',
  '      <div class="card-title">Overall</div>',
  `      <div class="card-value ${passClass}">${statusIcon(overallPass)} ${overallLabel}</div>`,
  `      <div class="card-detail">${overallDetail}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">Findings</div>',
  `      <div class="card-value ${passClass}">${statusIcon(overallPass)} ${errorCount} errors, ${warningCount} warnings, ${noteCount} notes${otherCount > 0 ? `, ${otherCount} other` : ''}</div>`,
  `      <div class="card-detail">${totalFindings} total across ${filesWithFindings} file${filesWithFindings !== 1 ? 's' : ''}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">Languages</div>',
  `      <div class="card-value">${analyzedLanguages.length}</div>`,
  `      <div class="card-detail">${analyzedLanguages.length > 0 ? analyzedLanguages.join(', ') : 'none'}</div>`,
  '    </div>',
  '    <div class="card">',
  '      <div class="card-title">Rules Triggered</div>',
  `      <div class="card-value">${Object.keys(byRule).length}</div>`,
  '      <div class="card-detail">unique CodeQL rules with findings</div>',
  '    </div>',
  '  </div>',
  '',
  `  ${buildWarningsHtml}`,
  '',
  '  <h2>Language Breakdown</h2>',
  `  ${languageBreakdown}`,
  '',
  '  <h2>Rule Breakdown</h2>',
  `  ${ruleBreakdown}`,
  '',
  '  <h2>All Findings</h2>',
  `  ${findingsSection}`,
  '',
  `  ${renderMeta(metaParts)}`,
].join('\n');

const html = htmlPage({
  title: 'CodeQL \u2014 Security & Quality Report',
  extraCSS,
  body,
});

// ---------------------------------------------------------------------------
// 13. Write output
// ---------------------------------------------------------------------------

const outFile = writeReport(resolve(rootDir, 'codeql-quality-report'), html);

console.log(
  `CodeQL quality report generated: ${outFile}  (${totalFindings} total finding${totalFindings !== 1 ? 's' : ''} across ${analyzedLanguages.length} language${analyzedLanguages.length !== 1 ? 's' : ''})`,
);

