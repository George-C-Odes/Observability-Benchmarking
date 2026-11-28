import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { gateResult, renderReport, runGate, safeRelativePath, summarizeSarif } from './semgrep-report.mjs';

const result = (ruleId, uri, line, extra = {}) => ({
  ruleId, message: { text: `${ruleId} message` },
  locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } }],
  ...extra,
});

function sarif(results, invocations = [{ executionSuccessful: true }]) {
  return { version: '2.1.0', runs: [{
    tool: { driver: { name: 'Semgrep OSS', rules: [
      { id: 'rule.error', defaultConfiguration: { level: 'error' } },
      { id: 'rule.warning', defaultConfiguration: { level: 'warning' } },
      { id: 'rule.note', defaultConfiguration: { level: 'note' } },
    ] } },
    invocations, results,
  }] };
}

function workspace(report) {
  const directory = mkdtempSync(path.join(tmpdir(), 'semgrep-gate-'));
  mkdirSync(path.join(directory, 'semgrep-results'));
  if (report !== undefined) writeFileSync(path.join(directory, 'semgrep-results', 'semgrep.sarif'), report);
  return directory;
}

function gate(directory, scanOutcome = 'success') {
  const summaryPath = path.join(directory, 'summary.md');
  let output = '';
  const outcome = runGate({ workingDirectory: directory, scanOutcome, summaryPath,
    stdout: { write: (chunk) => { output += chunk; } } });
  return { ...outcome, output, summary: readFileSync(summaryPath, 'utf8') };
}

test('every unsuppressed result is a finding, ordered by level and location', () => {
  const overview = summarizeSarif(sarif([
    result('rule.note', 'b.py', 3),
    result('rule.warning', 'a.py', 9),
    result('rule.error', 'c.py', 1),
    result('rule.warning', 'a.py', 2),
    result('rule.error', 'd.py', 1, { suppressions: [{ kind: 'inSource' }] }),
    result('rule.error', 'e.py', 1, { suppressions: [{ kind: 'external', status: 'rejected' }] }),
  ]));
  assert.equal(overview.findings.length, 5);
  assert.equal(overview.suppressed, 1);
  assert.equal(overview.rules, 3);
  assert.deepEqual(overview.byLevel, { error: 2, warning: 2, note: 1, none: 0 });
  assert.deepEqual(overview.findings.map((finding) => `${finding.uri}:${finding.line}`),
    ['c.py:1', 'e.py:1', 'a.py:2', 'a.py:9', 'b.py:3']);
});

test('result level overrides rule level and unknown levels fall back to warning', () => {
  const overview = summarizeSarif(sarif([
    result('rule.note', 'a.py', 1, { level: 'error' }),
    result('unlisted', 'b.py', 1, { level: 'bogus' }),
  ]));
  assert.deepEqual(overview.findings.map((finding) => finding.level), ['error', 'warning']);
});

test('malformed SARIF is rejected rather than read as zero findings', () => {
  for (const report of [undefined, {}, { version: '2.1.0', runs: [] }, { version: '2.0.0', runs: [{}] },
    { version: '2.1.0', runs: [{ tool: { driver: {} } }] }, { version: '2.1.0', runs: [{ results: [] }] },
    { version: '2.1.0', runs: [{ results: [], tool: { driver: {} } }] },
    { version: '2.1.0', runs: [{ results: [], tool: { driver: { name: ' ' } } }] }]) {
    assert.throws(() => summarizeSarif(report));
  }
});

test('gate fails on findings, incomplete scans and failed invocations', () => {
  const clean = summarizeSarif(sarif([]));
  const dirty = summarizeSarif(sarif([result('rule.note', 'a.py', 1)]));
  const failed = summarizeSarif(sarif([], [{ executionSuccessful: true }, { executionSuccessful: false }]));
  const errorNotification = [{ level: 'error', message: { text: 'Timeout during interfile analysis' } }];
  const executionError = summarizeSarif(sarif([], [{ executionSuccessful: true, toolExecutionNotifications: errorNotification }]));
  const configError = summarizeSarif(sarif([], [{ executionSuccessful: true, toolConfigurationNotifications: errorNotification }]));
  const warningsOnly = summarizeSarif(sarif([], [{ executionSuccessful: true,
    toolExecutionNotifications: [{ level: 'warning' }, { message: { text: 'default level is warning' } }],
    toolConfigurationNotifications: [{ level: 'note' }] }]));
  assert.equal(gateResult('success', clean), 'clean');
  assert.equal(gateResult('success', dirty), 'findings');
  assert.equal(gateResult('failure', dirty), 'findings-incomplete');
  assert.equal(gateResult('failure', clean), 'error');
  assert.equal(gateResult('', clean), 'error');
  assert.equal(gateResult('success', failed), 'error');
  assert.equal(gateResult('success', executionError), 'error');
  assert.equal(gateResult('success', configError), 'error');
  assert.equal(executionError.failedInvocations, 1);
  assert.equal(gateResult('success', summarizeSarif(sarif([result('rule.note', 'a.py', 1)],
    [{ executionSuccessful: true, toolExecutionNotifications: errorNotification }]))), 'findings-incomplete');
  assert.equal(gateResult('success', warningsOnly), 'clean');
  assert.equal(gateResult('success', undefined), 'error');
});

test('summary and annotations escape scanner-controlled text', () => {
  const overview = summarizeSarif(sarif([result('rule.error', 'src/app.py', 7, {
    message: { text: '<img src=x>|`bad`\n::warning::injected 50%' },
  }), result('rule,x:y', '../outside.py', 2)]));
  const { summary, annotations } = renderReport('success', overview);
  assert.ok(!summary.includes('<img'));
  assert.ok(!summary.includes('|`bad`'));
  assert.match(summary, /src\/app\.py:7/);
  const lines = annotations.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^::error file=src\/app\.py,line=7,title=Semgrep rule\.error::/);
  assert.match(lines[0], /50%25/);
  // The newline is neutralized, so the injected command stays mid-line data.
  assert.ok(!lines.some((line) => line.startsWith('::warning::')));
  assert.match(lines[0], /`bad` ::warning::injected/);
  assert.match(lines[1], /^::error title=Semgrep rule%2Cx%3Ay::/, 'unsafe paths are not annotated as files');
});

test('annotations are capped while the summary keeps the count', () => {
  const overview = summarizeSarif(sarif(Array.from({ length: 30 }, (_, index) => result('rule.error', 'a.py', index + 1))));
  const { summary, annotations } = renderReport('success', overview);
  assert.equal(annotations.trimEnd().split('\n').length, 11);
  assert.match(annotations, /20 more findings/);
  assert.match(summary, /5 additional findings/);
});

test('only plain workspace-relative paths are used as annotation files', () => {
  assert.equal(safeRelativePath('services/go/main.go'), 'services/go/main.go');
  for (const uri of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', './a', 'a\nb', 'C:\\x', 'a,b', 'file://x', 42]) {
    assert.equal(safeRelativePath(uri), '', String(uri));
  }
});

test('runGate exits 0 when clean and 1 with findings', () => {
  const cleanDirectory = workspace(JSON.stringify(sarif([])));
  const dirtyDirectory = workspace(JSON.stringify(sarif([result('rule.warning', 'a.py', 4)])));
  try {
    const clean = gate(cleanDirectory);
    assert.equal(clean.exitCode, 0);
    assert.match(clean.summary, /\*\*Passed:\*\*/);
    assert.equal(clean.output, 'Semgrep gate result: clean.\n');
    const dirty = gate(dirtyDirectory);
    assert.equal(dirty.exitCode, 1);
    assert.match(dirty.summary, /\*\*Failed:\*\* Semgrep reported findings/);
    assert.match(dirty.summary, /\| warning \| rule\.warning \| a\.py:4 \|/);
    assert.match(dirty.output, /^::error file=a\.py,line=4,/);
  } finally {
    rmSync(cleanDirectory, { recursive: true, force: true });
    rmSync(dirtyDirectory, { recursive: true, force: true });
  }
});

test('runGate fails closed on missing, malformed or incomplete reports', () => {
  const missing = workspace();
  const malformed = workspace('{not json');
  const scanFailed = workspace(JSON.stringify(sarif([])));
  try {
    for (const [directory, outcome, pattern] of [[missing, 'success', /No SARIF report was produced/],
      [malformed, 'success', /Report unavailable/], [scanFailed, 'failure', /did not complete/]]) {
      const run = gate(directory, outcome);
      assert.equal(run.exitCode, 2);
      assert.match(run.summary, pattern);
      assert.match(run.output, /^::error title=Semgrep scan incomplete::/m);
    }
  } finally {
    for (const directory of [missing, malformed, scanFailed]) rmSync(directory, { recursive: true, force: true });
  }
});

test('runGate rejects a symlinked report', (context) => {
  const directory = workspace();
  const outside = mkdtempSync(path.join(tmpdir(), 'semgrep-outside-'));
  try {
    const target = path.join(outside, 'semgrep.sarif');
    writeFileSync(target, JSON.stringify(sarif([])));
    try {
      symlinkSync(target, path.join(directory, 'semgrep-results', 'semgrep.sarif'));
    } catch (error) {
      if (error.code === 'EPERM') return context.skip('symlinks need elevated rights on this platform');
      throw error;
    }
    const run = gate(directory);
    assert.equal(run.exitCode, 2);
    assert.match(run.summary, /not a regular file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
