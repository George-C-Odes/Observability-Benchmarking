#!/usr/bin/env node
// Generates a self-contained quality report for the Next.js dashboard from
// Oxfmt, Oxlint, and TypeScript 7 native-checker output.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  esc,
  statusIcon,
  readOptionalFile,
  buildMetaParts,
  renderMeta,
  htmlPage,
  writeReport,
} from './report-helpers.mjs';

const OXFMT_EXIT_CODE = /(?:^|\n)OXFMT_EXIT_CODE=(\d+)\s*$/;
const TYPESCRIPT_DIAGNOSTIC_MARKERS = [
  { token: '): error ts', severity: 'error' },
  { token: '): warning ts', severity: 'warning' },
];

function isDecimal(value) {
  if (value.length === 0) return false;
  for (const character of value) {
    if (character < '0' || character > '9') return false;
  }
  return true;
}

/** Parse TypeScript's stable file(line,column): severity TScode: message format in linear time. */
function parseTypeScriptDiagnosticLine(line) {
  const normalized = line.toLowerCase();
  let marker = null;
  let markerIndex = -1;

  for (const candidate of TYPESCRIPT_DIAGNOSTIC_MARKERS) {
    const candidateIndex = normalized.indexOf(candidate.token);
    if (candidateIndex >= 0 && (markerIndex < 0 || candidateIndex < markerIndex)) {
      marker = candidate;
      markerIndex = candidateIndex;
    }
  }

  if (!marker || markerIndex === 0) return null;

  const locationStart = line.lastIndexOf('(', markerIndex);
  if (locationStart <= 0) return null;

  const coordinates = line.slice(locationStart + 1, markerIndex);
  const comma = coordinates.indexOf(',');
  if (comma <= 0 || coordinates.indexOf(',', comma + 1) >= 0) return null;

  const lineNumber = coordinates.slice(0, comma);
  const columnNumber = coordinates.slice(comma + 1);
  if (!isDecimal(lineNumber) || !isDecimal(columnNumber)) return null;

  const codeStart = markerIndex + marker.token.length;
  const codeEnd = line.indexOf(':', codeStart);
  if (codeEnd < 0) return null;

  const code = line.slice(codeStart, codeEnd);
  if (!isDecimal(code)) return null;

  return {
    filename: line.slice(0, locationStart),
    line: Number(lineNumber),
    column: Number(columnNumber),
    severity: marker.severity,
    code: `TS${code}`,
    message: line.slice(codeEnd + 1).trimStart(),
  };
}

function normalizedPath(value) {
  return String(value || '').replaceAll('\\', '/');
}

/** Make either Windows or POSIX absolute diagnostic paths project-relative. */
export function displayPath(cwd, filename) {
  const path = normalizedPath(filename);
  const root = normalizedPath(cwd).replace(/\/$/, '');
  if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return path.slice(root.length + 1);
  }
  return path.replace(/^\.\//, '');
}

/** Parse the object emitted by Oxlint 1.82's JSON formatter. */
export function parseOxlintReport(raw) {
  const reportWarnings = [];
  if (raw === null) {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      numberOfFiles: 0,
      pass: false,
      reportWarnings: ['Oxlint report file was not found.'],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      numberOfFiles: 0,
      pass: false,
      reportWarnings: ['Oxlint report is malformed and could not be parsed.'],
    };
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.diagnostics)) {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      numberOfFiles: 0,
      pass: false,
      reportWarnings: ['Oxlint report does not contain a diagnostics array.'],
    };
  }

  const diagnostics = [];
  for (const [index, item] of parsed.diagnostics.entries()) {
    if (!item || typeof item !== 'object') {
      reportWarnings.push(`Oxlint diagnostic ${index + 1} is malformed and was skipped.`);
      continue;
    }
    const label = Array.isArray(item.labels)
      ? item.labels.find((candidate) => candidate?.span && typeof candidate.span === 'object')
      : undefined;
    const span = label?.span || {};
    if (typeof item.message !== 'string' || typeof item.filename !== 'string') {
      reportWarnings.push(`Oxlint diagnostic ${index + 1} is missing required fields.`);
    }
    if (item.severity !== 'error' && item.severity !== 'warning') {
      reportWarnings.push(`Oxlint diagnostic ${index + 1} has an unknown severity.`);
    }
    diagnostics.push({
      filename: typeof item.filename === 'string' ? item.filename : '(unknown file)',
      message: typeof item.message === 'string' ? item.message : '(missing message)',
      ruleId: typeof item.code === 'string' ? item.code : null,
      severity: item.severity === 'error' || item.severity === 'warning' ? item.severity : 'info',
      line: Number.isInteger(span.line) ? span.line : null,
      column: Number.isInteger(span.column) ? span.column : null,
      length: Number.isInteger(span.length) ? span.length : null,
    });
  }

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;
  const numberOfFiles = Number.isInteger(parsed.number_of_files)
    ? parsed.number_of_files
    : new Set(diagnostics.map((item) => item.filename)).size;

  return {
    diagnostics,
    errorCount,
    warningCount,
    numberOfFiles,
    pass: errorCount === 0 && warningCount === 0 && reportWarnings.length === 0,
    reportWarnings,
  };
}

/** Parse TypeScript's file(line,column) diagnostics, retaining continuation lines. */
export function parseTypeScriptDiagnostics(raw) {
  if (raw === null) {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      pass: false,
      reportWarnings: ['TypeScript diagnostics file was not found.'],
    };
  }
  if (raw.trim() === '') {
    return { diagnostics: [], errorCount: 0, warningCount: 0, pass: true, reportWarnings: [] };
  }

  const diagnostics = [];
  let current = null;
  for (const line of raw.replaceAll('\r\n', '\n').split('\n')) {
    const diagnostic = parseTypeScriptDiagnosticLine(line);
    if (diagnostic) {
      const { message, ...metadata } = diagnostic;
      current = {
        ...metadata,
        messageLines: [message],
      };
      diagnostics.push(current);
    } else if (current && /^\s+\S/.test(line)) {
      current.messageLines.push(line.trimEnd());
    }
  }

  if (diagnostics.length === 0) {
    return {
      diagnostics: [],
      errorCount: 0,
      warningCount: 0,
      pass: false,
      reportWarnings: ['TypeScript output was non-empty but contained no recognized diagnostics.'],
    };
  }

  const finalized = diagnostics.map(({ messageLines, ...item }) => ({
    ...item,
    message: messageLines.join('\n'),
  }));
  const errorCount = finalized.filter((item) => item.severity === 'error').length;
  const warningCount = finalized.filter((item) => item.severity === 'warning').length;
  return {
    diagnostics: finalized,
    errorCount,
    warningCount,
    pass: errorCount === 0 && warningCount === 0,
    reportWarnings: [],
  };
}

/** Parse Oxfmt output with the explicit exit-code marker written by CI. */
export function parseOxfmtOutput(raw) {
  if (raw === null) {
    return {
      output: '',
      exitCode: null,
      pass: false,
      reportWarnings: ['Oxfmt output file was not found.'],
    };
  }
  const normalized = raw.replaceAll('\r\n', '\n');
  const match = OXFMT_EXIT_CODE.exec(normalized);
  if (!match) {
    return {
      output: raw.trim(),
      exitCode: null,
      pass: false,
      reportWarnings: ['Oxfmt output is missing its exit-code marker.'],
    };
  }
  const exitCode = Number(match[1]);
  return {
    output: normalized.replace(OXFMT_EXIT_CODE, '').trim(),
    exitCode,
    pass: exitCode === 0,
    reportWarnings: [],
  };
}

function severityBadge(severity) {
  if (severity === 'error') return '<span class="badge badge-error">error</span>';
  if (severity === 'warning') return '<span class="badge badge-warn">warning</span>';
  return '<span class="badge badge-note">info</span>';
}

function locationText(item) {
  if (item.line === null || item.column === null) return '\u2014';
  const length = item.length === null ? '' : ` (+${item.length})`;
  return `${item.line}:${item.column}${length}`;
}

function diagnosticsTable(cwd, diagnostics, type) {
  if (diagnostics.length === 0) return '';
  const rows = diagnostics.map((item) => {
    const rule = type === 'oxlint' ? item.ruleId || '\u2014' : item.code;
    return '<tr>'
      + `<td class="cell-file" title="${esc(item.filename)}">${esc(displayPath(cwd, item.filename))}</td>`
      + `<td class="cell-loc">${esc(locationText(item))}</td>`
      + `<td>${severityBadge(item.severity)}</td>`
      + `<td class="cell-rule">${esc(rule)}</td>`
      + `<td><pre class="diagnostic-message">${esc(item.message)}</pre></td>`
      + '</tr>';
  }).join('\n');
  return '<div class="table-scroll"><table>'
    + '<thead><tr><th>File</th><th>Location</th><th>Severity</th><th>Rule</th><th>Message</th></tr></thead>'
    + `<tbody>${rows}</tbody></table></div>`;
}

/** Build report HTML without file-system side effects so fixtures can test it. */
export function buildQualityReport({
  cwd,
  oxlintRaw,
  oxfmtRaw,
  typescriptRaw,
  env = process.env,
  timestamp = new Date().toISOString(),
}) {
  const oxlint = parseOxlintReport(oxlintRaw);
  const oxfmt = parseOxfmtOutput(oxfmtRaw);
  const typescript = parseTypeScriptDiagnostics(typescriptRaw);
  const reportWarnings = [
    ...oxfmt.reportWarnings,
    ...oxlint.reportWarnings,
    ...typescript.reportWarnings,
  ];
  const overallPass = oxfmt.pass && oxlint.pass && typescript.pass && reportWarnings.length === 0;

  const oxlintSection = diagnosticsTable(cwd, oxlint.diagnostics, 'oxlint')
    || '<p class="empty-state">No Oxlint findings \u2014 all checks passed.</p>';
  const typescriptSection = diagnosticsTable(cwd, typescript.diagnostics, 'typescript')
    || (typescriptRaw === null
      ? '<p class="muted">TypeScript diagnostics file was not found.</p>'
      : '<p class="empty-state">No TypeScript diagnostics \u2014 all checks passed.</p>');
  const oxfmtSection = oxfmt.output
    ? `<pre class="tool-output">${esc(oxfmt.output)}</pre>`
    : (oxfmtRaw === null
      ? '<p class="muted">Oxfmt output file was not found.</p>'
      : '<p class="empty-state">No formatting differences \u2014 all checks passed.</p>');
  const warningSection = reportWarnings.length > 0
    ? '<section class="report-warnings"><h2>Report-generation warnings</h2><ul>'
      + reportWarnings.map((warning) => `<li>${esc(warning)}</li>`).join('')
      + '</ul></section>'
    : '';

  const metaExtras = [];
  if (env.NODE_VERSION || process.version) metaExtras.push(`Node ${esc(env.NODE_VERSION || process.version)}`);
  if (env.NPM_VERSION) metaExtras.push(`npm ${esc(env.NPM_VERSION)}`);
  if (env.OXFMT_VERSION) metaExtras.push(`Oxfmt ${esc(env.OXFMT_VERSION)}`);
  if (env.OXLINT_VERSION) metaExtras.push(`Oxlint ${esc(env.OXLINT_VERSION)}`);
  if (env.TYPESCRIPT_VERSION) metaExtras.push(`TypeScript ${esc(env.TYPESCRIPT_VERSION)}`);
  if (env.VITEST_VERSION) metaExtras.push(`Vitest ${esc(env.VITEST_VERSION)}`);
  const metaParts = buildMetaParts({
    repo: env.GITHUB_REPOSITORY || '',
    commitSha: env.GITHUB_SHA || 'local',
    runId: env.GITHUB_RUN_ID || '',
    timestamp,
    extras: metaExtras,
  });

  const body = [
    '  <h1>Next.js Dashboard \u2014 Quality Report</h1>',
    '  <p class="subtitle">Oxlint static analysis, Oxfmt formatting, and TypeScript 7 native strict-mode checking.</p>',
    warningSection,
    '  <div class="summary-grid">',
    `    <div class="card"><div class="card-title">Overall</div><div class="card-value ${overallPass ? 'status-pass' : 'status-fail'}">${statusIcon(overallPass)} ${overallPass ? 'Pass' : 'Fail'}</div></div>`,
    `    <div class="card"><div class="card-title">Oxfmt</div><div class="card-value ${oxfmt.pass ? 'status-pass' : 'status-fail'}">${statusIcon(oxfmt.pass)} ${oxfmt.pass ? 'Pass' : 'Fail'}</div><div class="card-detail">Deterministic formatting check</div></div>`,
    `    <div class="card"><div class="card-title">Oxlint</div><div class="card-value ${oxlint.pass ? 'status-pass' : 'status-fail'}">${statusIcon(oxlint.pass)} ${oxlint.errorCount} errors, ${oxlint.warningCount} warnings</div><div class="card-detail">${oxlint.numberOfFiles} files analyzed</div></div>`,
    `    <div class="card"><div class="card-title">TypeScript 7</div><div class="card-value ${typescript.pass ? 'status-pass' : 'status-fail'}">${statusIcon(typescript.pass)} ${typescript.errorCount} errors${typescript.warningCount ? `, ${typescript.warningCount} warnings` : ''}</div><div class="card-detail">Native strict checker (tsc --noEmit)</div></div>`,
    '  </div>',
    '  <h2>Oxfmt Check</h2>',
    `  ${oxfmtSection}`,
    '  <h2>Oxlint Findings</h2>',
    `  ${oxlintSection}`,
    '  <h2>TypeScript 7 Diagnostics</h2>',
    `  ${typescriptSection}`,
    `  ${renderMeta(metaParts)}`,
  ].join('\n');

  const extraCSS = [
    '    .table-scroll { overflow-x: auto; }',
    '    pre.tool-output, pre.diagnostic-message { margin: 0; white-space: pre-wrap; }',
    '    pre.tool-output { background: var(--pre-bg); border: 1px solid var(--card-border); border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-size: 0.82rem; line-height: 1.6; }',
    '    pre.diagnostic-message { font: inherit; }',
    '    .report-warnings { border: 1px solid var(--warn); border-radius: 0.5rem; padding: 0 1rem; margin-bottom: 1rem; }',
    '    .report-warnings h2 { color: var(--warn); border: 0; margin-top: 1rem; }',
  ].join('\n');

  return {
    html: htmlPage({ title: 'Next.js Dashboard \u2014 Quality Report', extraCSS, body }),
    summary: {
      overallPass,
      issueCount:
        oxlint.errorCount
        + oxlint.warningCount
        + typescript.errorCount
        + typescript.warningCount
        + (oxfmt.pass ? 0 : 1),
      reportWarnings,
    },
  };
}

export function generateQualityReport(cwd = process.cwd(), env = process.env) {
  const { html, summary } = buildQualityReport({
    cwd,
    oxlintRaw: readOptionalFile(cwd, 'oxlint-report.json'),
    oxfmtRaw: readOptionalFile(cwd, 'oxfmt-output.txt'),
    typescriptRaw: readOptionalFile(cwd, 'typescript-output.txt'),
    env,
  });
  for (const warning of summary.reportWarnings) console.warn(`Warning: ${warning}`);
  const outFile = writeReport(resolve(cwd, 'quality-report'), html);
  console.log(
    `Quality report generated: ${outFile}  (${summary.issueCount} total finding${summary.issueCount === 1 ? '' : 's'})`,
  );
  return { outFile, ...summary };
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPoint && fileURLToPath(import.meta.url) === entryPoint) {
  generateQualityReport();
}
