import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildQualityReport,
  displayPath,
  parseOxfmtOutput,
  parseOxlintReport,
  parseTypeScriptDiagnostics,
} from './generate-nextjs-quality-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(here, 'fixtures/nextjs-quality', name), 'utf8');

test('parses clean Oxlint 1.82 JSON output', () => {
  const result = parseOxlintReport(fixture('oxlint-clean.json'));
  assert.equal(result.pass, true);
  assert.equal(result.numberOfFiles, 137);
  assert.deepEqual(result.diagnostics, []);
});

test('parses Oxlint warnings, errors, rule IDs, and source spans', () => {
  const result = parseOxlintReport(fixture('oxlint-findings.json'));
  assert.equal(result.pass, false);
  assert.equal(result.errorCount, 1);
  assert.equal(result.warningCount, 1);
  assert.deepEqual(result.diagnostics[0], {
    filename: 'C:\\repo\\utils\\nextjs-dash\\app\\page.tsx',
    message: "'MissingComponent' is not defined.",
    ruleId: 'react(jsx-no-undef)',
    severity: 'error',
    line: 1,
    column: 30,
    length: 16,
  });
});

test('normalizes Windows and POSIX paths relative to the dashboard root', () => {
  assert.equal(
    displayPath('C:\\repo\\utils\\nextjs-dash', 'C:\\repo\\utils\\nextjs-dash\\app\\page.tsx'),
    'app/page.tsx',
  );
  assert.equal(
    displayPath('/workspace/utils/nextjs-dash', '/workspace/utils/nextjs-dash/lib/config.ts'),
    'lib/config.ts',
  );
});

test('retains multiline TypeScript diagnostics', () => {
  const result = parseTypeScriptDiagnostics(fixture('typescript-multiline.txt'));
  assert.equal(result.errorCount, 1);
  assert.equal(result.warningCount, 1);
  assert.match(result.diagnostics[0].message, /Property 'enabled' is missing/);
  assert.equal(result.diagnostics[1].code, 'TS9999');
});

test('marks missing and malformed inputs as report-generation warnings', () => {
  assert.equal(parseOxlintReport(null).pass, false);
  assert.match(parseOxlintReport('{nope').reportWarnings[0], /malformed/);
  assert.match(parseOxlintReport('{}').reportWarnings[0], /diagnostics array/);
  assert.equal(parseTypeScriptDiagnostics('compiler crashed').pass, false);
  assert.equal(parseOxfmtOutput('Checking formatting...').pass, false);

  const report = buildQualityReport({
    cwd: '/workspace/utils/nextjs-dash',
    oxlintRaw: null,
    oxfmtRaw: null,
    typescriptRaw: null,
    env: {},
    timestamp: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(report.summary.overallPass, false);
  assert.match(report.html, /Report-generation warnings/);
  assert.match(report.html, /Oxlint report file was not found/);
});

test('includes Oxfmt in pass and seeded-failure verdicts', () => {
  const passing = buildQualityReport({
    cwd: '/workspace/utils/nextjs-dash',
    oxlintRaw: fixture('oxlint-clean.json'),
    oxfmtRaw: 'All matched files use the correct format.\nOXFMT_EXIT_CODE=0\n',
    typescriptRaw: '',
    env: {},
    timestamp: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(passing.summary.overallPass, true);
  assert.match(passing.html, /Oxlint static analysis, Oxfmt formatting/);

  const failing = buildQualityReport({
    cwd: 'C:\\repo\\utils\\nextjs-dash',
    oxlintRaw: fixture('oxlint-findings.json'),
    oxfmtRaw: 'app/page.tsx\nOXFMT_EXIT_CODE=1\n',
    typescriptRaw: fixture('typescript-multiline.txt'),
    env: {},
    timestamp: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(failing.summary.overallPass, false);
  assert.match(failing.html, /app\/page\.tsx/);
  assert.match(failing.html, /1:30 \(\+16\)/);
  assert.match(failing.html, /TS2322/);
  assert.match(failing.html, /Property 'enabled' is missing/);
});
