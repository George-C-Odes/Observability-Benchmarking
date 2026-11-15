import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkCoverage } from './coverage-gate.mjs';

function fixture(t) {
  const prefix = path.join(tmpdir(), 'obbench-coverage-');
  const root = mkdtempSync(prefix);
  t.after(() => {
    assert.ok(root.startsWith(prefix));
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(
    path.join(root, 'coverage-policy.json'),
    JSON.stringify({ thresholds: { lines: 90, branches: 90 } }),
  );
  return root;
}

function report(
  root,
  environment,
  covered = 90,
  total = 100,
  branchCovered = covered,
  name = `${environment}.ts`,
) {
  const directory = path.join(root, 'coverage', environment);
  mkdirSync(directory, { recursive: true });
  const counters = { lines: { covered, total }, branches: { covered: branchCovered, total } };
  writeFileSync(
    path.join(directory, 'coverage-summary.json'),
    JSON.stringify({ total: counters, [name]: counters }),
  );
}

test('combined dashboard counters enforce both metrics without rounding', (t) => {
  const root = fixture(t);
  report(root, 'node', 100);
  report(root, 'dom', 80);
  assert.equal(checkCoverage(root), true);
  report(root, 'dom', 79);
  assert.equal(checkCoverage(root), false);
  report(root, 'dom', 100, 100, 79);
  assert.equal(checkCoverage(root), false);
  report(root, 'node', 89999, 100000);
  report(root, 'dom', 89999, 100000);
  assert.equal(checkCoverage(root), false);
});

test('missing suites and malformed or overlapping counters fail closed', (t) => {
  const root = fixture(t);
  report(root, 'node');
  assert.throws(() => checkCoverage(root));
  for (const value of [-1, true, 90.5, 101]) {
    report(root, 'dom', value);
    assert.throws(() => checkCoverage(root));
  }
  report(root, 'dom', 90, 100, 90, 'node.ts');
  assert.throws(() => checkCoverage(root));
  report(root, 'dom', 0, 0);
  assert.throws(() => checkCoverage(root));
});

test('independent policy changes are applied by the native checker', (t) => {
  const root = fixture(t);
  report(root, 'node', 80);
  report(root, 'dom', 80);
  assert.equal(checkCoverage(root), false);
  writeFileSync(
    path.join(root, 'coverage-policy.json'),
    JSON.stringify({ thresholds: { lines: 80, branches: 80 } }),
  );
  assert.equal(checkCoverage(root), true);
});
