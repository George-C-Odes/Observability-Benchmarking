import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderScanReport, summarizeSarif } from './snyk-report.mjs';

function fixture() {
  const rules = [
    { id: 'SNYK-A', shortDescription: { text: 'Critical dependency' }, properties: { 'security-severity': '9.8' } },
    { id: 'SNYK-B', shortDescription: { text: 'High dependency' }, properties: { 'security-severity': '7.5' } },
  ];
  const result = (ruleId, uri) => ({ ruleId, level: 'error', message: { text: 'A vulnerable dependency' },
    locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: 1 } } }] });
  return { version: '2.1.0', runs: [
    { tool: { driver: { name: 'Snyk Open Source', rules } },
      results: [result('SNYK-A', 'a/pom.xml'), result('SNYK-B', 'a/pom.xml')] },
    { tool: { driver: { name: 'Snyk Open Source', rules } }, results: [result('SNYK-A', 'b/pom.xml')] },
  ] };
}

test('overview counts SARIF occurrences and unique issues rather than dependency paths', () => {
  const dependencies = [
    { vulnerabilities: Array.from({ length: 5 }, () => ({ id: 'SNYK-A', severity: 'critical',
      packageName: 'library-a', fixedIn: ['2.0'] })) },
    { vulnerabilities: [{ id: 'SNYK-A', severity: 'critical', fixedIn: ['2.1'] }] },
  ];
  const report = summarizeSarif(fixture(), dependencies);
  assert.equal(report.total, 3);
  assert.equal(report.unique, 2);
  assert.equal(report.projectsScanned, 2);
  assert.equal(report.projects.length, 2);
  assert.deepEqual(report.bySeverity, { critical: 2, high: 1, medium: 0, low: 0, unknown: 0 });
  assert.deepEqual(report.uniqueBySeverity, { critical: 1, high: 1, medium: 0, low: 0, unknown: 0 });
  assert.equal(report.issues[0].files.size, 2);
  assert.deepEqual([...report.issues[0].fixedIn], ['2.0', '2.1']);
  assert.equal(report.projects[0].file, 'a/pom.xml');
  assert.equal(report.projects[0].occurrences, 2);
});

test('single-project JSON enriches primary severity without allowing unknown severity to override it', () => {
  const json = { vulnerabilities: [
    { id: 'SNYK-A', severityWithCritical: 'high', title: 'Primary rating', packageName: 'library-a' },
    { id: 'SNYK-A', title: 'No severity' },
  ] };
  const overview = summarizeSarif(fixture(), json);
  assert.equal(overview.issues.find((issue) => issue.id === 'SNYK-A').severity, 'high');
  assert.equal(overview.issues.find((issue) => issue.id === 'SNYK-A').title, 'Primary rating');
});

test('Code overview resolves indexed rules and artifacts, level fallbacks and coverage', () => {
  const sarif = { version: '2.1.0', runs: [{
    tool: { driver: { name: 'SnykCode', rules: [{ id: 'CODE-A', shortDescription: { text: 'Unsafe code' } }] } },
    artifacts: [{ location: { uri: 'src/code.js' } }],
    results: [{ ruleIndex: 0, level: 'warning', message: { text: 'Code issue' },
      locations: [{ physicalLocation: { artifactLocation: { index: 0 } } }] },
    { ruleId: 'CODE-B', message: { text: 'Unknown severity' } }],
    properties: { coverage: [{ files: 10, isSupported: true }, { files: 3, isSupported: false }] },
  }] };
  const overview = summarizeSarif(sarif);
  assert.equal(overview.bySeverity.medium, 1);
  assert.equal(overview.bySeverity.unknown, 1);
  assert.equal(overview.projects.find((project) => project.file === 'src/code.js').occurrences, 1);
  const { summary, annotation } = renderScanReport('code', 'findings', 1, overview);
  assert.match(summary, /Files analyzed: \*\*10\*\*; files not analyzed: \*\*3\*\*/);
  assert.match(annotation, /title=Snyk Code/);
  assert.match(annotation, /2 unique issues; 2 occurrences/);
});

test('summary and annotation include useful totals, top issues, fixes and safe escaping', () => {
  const json = { vulnerabilities: [{ id: 'SNYK-A', severity: 'critical',
    title: '<img src=x>|`bad`\n::error::injected 50%', packageName: 'library-a', fixedIn: ['2.0'] }] };
  const overview = summarizeSarif(fixture(), json);
  const { summary, annotation } = renderScanReport('test', 'findings', 1, overview);
  assert.match(summary, /3 occurrences across 2 affected files/);
  assert.match(summary, /\| critical \| 1 \| 2 \|/);
  assert.match(summary, /a\/pom.xml/);
  assert.match(summary, /security.snyk.io\/vuln\/SNYK-A/);
  assert.match(summary, /library-a/);
  assert.match(summary, /2\.0/);
  assert.ok(!summary.includes('<img'));
  assert.ok(!summary.includes('|`bad`'));
  assert.match(annotation, /title=Snyk Open Source — findings overview/);
  assert.match(annotation, /critical: 2; high: 1/);
  assert.match(annotation, /fixed in 2\.0/);
  assert.match(annotation, /50%25/);
  assert.match(annotation, /%0A/);
  assert.equal(annotation.trim().split('\n').length, 1);
});

test('large reports show at most 10 files/issues in summaries and 3 issues in annotations', () => {
  const sarif = fixture();
  sarif.runs = [sarif.runs[0]];
  sarif.runs[0].results = Array.from({ length: 15 }, (_, index) => ({
    ruleId: `UNIQUE-${String(index).padStart(2, '0')}`, level: 'error', message: { text: 'An issue' },
    locations: [{ physicalLocation: { artifactLocation: { uri: `file-${index}.xml` } } }],
  }));
  const { summary, annotation } = renderScanReport('test', 'findings', 1, summarizeSarif(sarif));
  assert.match(summary, /5 additional affected files/);
  assert.match(summary, /5 additional unique issues/);
  assert.equal((summary.match(/\| high \| UNIQUE-/g) || []).length, 10);
  assert.equal((annotation.match(/HIGH UNIQUE-/g) || []).length, 3);
  assert.match(annotation, /12 more unique issues/);
});

test('clean reports show zero findings, while missing reports and scan errors never imply clean coverage', () => {
  const sarif = fixture();
  for (const run of sarif.runs) run.results = [];
  const clean = renderScanReport('test', 'clean', 0, summarizeSarif(sarif));
  assert.match(clean.summary, /0 unique issues; 0 occurrences/);
  assert.equal(clean.annotation, '');
  const unavailable = renderScanReport('test', 'error', 2);
  assert.match(unavailable.summary, /Scan incomplete/);
  assert.match(unavailable.summary, /Overview unavailable/);
  assert.match(unavailable.annotation, /Issue counts unavailable/);
  assert.ok(!unavailable.summary.includes('0 unique issues'));
  const partial = renderScanReport('test', 'error', 2, summarizeSarif(fixture()));
  assert.match(partial.annotation, /Partial overview/);
  const monitor = renderScanReport('monitor', 'error', 1);
  assert.match(monitor.annotation, /Snyk monitor failed to complete/);
});

test('invalid SARIF and unknown modes are rejected rather than shown as zero issues', () => {
  for (const sarif of [null, {}, { version: '2.1.0', runs: [] },
    { version: '2.1.0', runs: [{ tool: { driver: {} } }] }]) {
    assert.throws(() => summarizeSarif(sarif), /SARIF/);
  }
  assert.throws(() => renderScanReport('invalid', 'clean', 0), /Unknown Snyk report mode/);
});
