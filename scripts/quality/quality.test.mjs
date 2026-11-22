import assert from 'node:assert/strict';
import test from 'node:test';
import { scriptLinter } from './check.mjs';

const coveredHelper = 'scripts/ci/workflow-action-versions.mjs';

test('the quality gate rejects excessive cognitive complexity and control regexes', async () => {
  const linter = scriptLinter();
  const [complex] = await linter.lintText('function example(a) {' + 'if (a) {'.repeat(6) + 'a();' + '}'.repeat(6) + '}', { filePath: coveredHelper });
  assert.ok(complex.messages.some((message) => message.ruleId === 'sonarjs/cognitive-complexity'));
  const [control] = await linter.lintText(String.raw`const bad = /[\x00]/;`, { filePath: coveredHelper });
  assert.ok(control.messages.some((message) => message.ruleId === 'no-control-regex'));
  const [simple] = await linter.lintText('function example(a) { if (a) return a; return null; }', { filePath: coveredHelper });
  assert.equal(simple.errorCount, 0);
});

test('the quality gate catches the original polynomial backtracking in any production helper', async () => {
  const linter = scriptLinter();
  const original = String.raw`content.matchAll(/^[ \t]*(?:-[ \t]+)?uses:[ \t]+(['"]?)([^\s#'"]+)\1([ \t]+#[^\r\n]*)?[ \t]*\r?$/gm);`;
  for (const filePath of [coveredHelper, 'scripts/new-helper.mjs']) {
    const [result] = await linter.lintText(original, { filePath });
    assert.ok(result.messages.some((message) => message.ruleId === 'regexp/no-super-linear-backtracking'), filePath);
  }
  const [current] = await linter.lintFiles([coveredHelper]);
  assert.equal(current.errorCount, 0, JSON.stringify(current.messages));
});

test('the quality gate requires explicit sort comparators without type services', async () => {
  const linter = scriptLinter();
  for (const expression of ['values.sort()', 'values.toSorted()', "values['sort']()", "values['toSorted']()", 'values?.sort()']) {
    const [result] = await linter.lintText(expression, { filePath: coveredHelper });
    assert.ok(result.messages.some((message) => message.ruleId === 'no-restricted-syntax'), expression);
  }
  for (const expression of ['values.sort((a, b) => a.localeCompare(b))', 'values.toSorted((a, b) => a - b)']) {
    const [result] = await linter.lintText(expression, { filePath: coveredHelper });
    assert.equal(result.errorCount, 0, expression);
  }
});
