import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureCheck } from './capture-check.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

test('checks capture one invocation per tool, preserving flags and failure status', (t) => {
  const cwd = temporaryDirectory(t, 'capture-check-');
  for (const [name, command] of [['oxfmt', 'oxfmt'], ['oxlint', 'oxlint'], ['next', 'next'], ['typescript', 'tsc']]) {
    const directory = join(cwd, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ bin: { [command]: 'bin.js' } }));
  }
  for (const mode of ['format', 'lint', 'typecheck']) {
    for (const exitCode of [0, 1, 2]) {
      const calls = [];
      const status = captureCheck(mode, { cwd, stdout: { write() {} }, run: (exe, args, options) => {
        calls.push({ exe, args, options });
        return { status: exitCode, stdout: 'diagnostic\n', stderr: '' };
      } });
      assert.equal(status, exitCode);
      assert.equal(calls.length, mode === 'typecheck' && exitCode === 0 ? 2 : 1);
      for (const call of calls) {
        assert.equal(call.exe, process.execPath);
        assert.equal(call.options.shell, false);
        assert.equal(call.options.timeout, 300_000);
      }
      if (mode === 'lint') assert.deepEqual(calls[0].args.slice(1), ['--deny-warnings', '--format', 'json', '.']);
      assert.equal(JSON.parse(readFileSync(join(cwd, `${mode}-status.json`))).exitCode, exitCode);
    }
  }
  assert.throws(() => captureCheck('../invalid', { cwd }), /Unknown/);
});

test('startup errors and timeouts cannot produce passing evidence', (t) => {
  const cwd = temporaryDirectory(t, 'capture-startup-');
  assert.equal(captureCheck('typecheck', { cwd }), 2);
  assert.match(readFileSync(join(cwd, 'typescript-output.txt'), 'utf8'), /could not start/);
});

test('a real hung checker is terminated and retains its partial diagnostics', (t) => {
  const cwd = temporaryDirectory(t, 'capture-timeout-');
  const directory = join(cwd, 'node_modules', 'oxfmt');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ bin: { oxfmt: 'hang.cjs' } }));
  writeFileSync(join(directory, 'hang.cjs'), 'process.on("SIGTERM", () => {}); process.stdout.write("partial output\\n"); setInterval(() => {}, 100);');
  const started = Date.now();
  assert.equal(captureCheck('format', { cwd, timeout: 1000, stdout: { write() {} } }), 2);
  assert.ok(Date.now() - started < 5000);
  assert.match(readFileSync(join(cwd, 'oxfmt-output.txt'), 'utf8'), /partial output[\s\S]*OXFMT_EXIT_CODE=2/);
});
