import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { temporaryDirectory } from './test-helpers.mjs';

async function fixture(t, prefix) {
  const root = temporaryDirectory(t, prefix);
  const cwd = join(root, 'utils/nextjs-dash');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(root, 'scripts'));
  const script = join(root, 'scripts/capture-check.mjs');
  copyFileSync(new URL('./capture-check.mjs', import.meta.url), script);
  const { captureCheck } = await import(pathToFileURL(script).href);
  return { root, cwd, captureCheck, script };
}

test('checks capture one invocation per tool, preserving flags and failure status', async (t) => {
  const { cwd, captureCheck } = await fixture(t, 'capture-check-');
  for (const [name, command] of [['oxfmt', 'oxfmt'], ['oxlint', 'oxlint'], ['next', 'next'], ['typescript', 'tsc']]) {
    const directory = join(cwd, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ bin: { [command]: 'bin.js' } }));
    writeFileSync(join(directory, 'bin.js'), '');
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

test('startup errors and timeouts cannot produce passing evidence', async (t) => {
  const { cwd, captureCheck } = await fixture(t, 'capture-startup-');
  assert.equal(captureCheck('typecheck', { cwd }), 2);
  assert.match(readFileSync(join(cwd, 'typescript-output.txt'), 'utf8'), /could not start/);
});

test('a real hung checker is terminated and retains its partial diagnostics', async (t) => {
  const { cwd, captureCheck } = await fixture(t, 'capture-timeout-');
  const directory = join(cwd, 'node_modules', 'oxfmt');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ bin: { oxfmt: 'hang.cjs' } }));
  writeFileSync(join(directory, 'hang.cjs'), 'process.on("SIGTERM", () => {}); process.stdout.write("partial output\\n"); setInterval(() => {}, 100);');
  const started = Date.now();
  assert.equal(captureCheck('format', { cwd, timeout: 1000, stdout: { write() {} } }), 2);
  assert.ok(Date.now() - started < 5000);
  assert.match(readFileSync(join(cwd, 'oxfmt-output.txt'), 'utf8'), /partial output[\s\S]*OXFMT_EXIT_CODE=2/);
});


test('malicious modes cannot execute tools or create outside evidence', async (t) => {
  const { root, cwd, captureCheck } = await fixture(t, 'capture-mode-');
  let calls = 0;
  for (const mode of ['../format', 'format/../lint', '/tmp/lint', 'lint\n', '__proto__', 'constructor']) {
    assert.throws(() => captureCheck(mode, { run() { calls++; } }), /Unknown/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(readdirSync(cwd), []);
  assert.equal(existsSync(join(root, 'format-status.json')), false);
});

test('redirected dashboard directories cannot write outside the trusted workspace', async (t) => {
  const { root, cwd, captureCheck } = await fixture(t, 'capture-root-');
  const outside = join(root, 'outside');
  renameSync(cwd, outside);
  symlinkSync(outside, cwd, 'junction');
  let calls = 0;
  assert.throws(() => captureCheck('format', { run() { calls++; } }), /symlinks/);
  assert.equal(calls, 0);
  assert.equal(existsSync(join(outside, 'format-status.json')), false);
});

test('manifest traversal and redirected package parents cannot execute outside code', async (t) => {
  for (const bin of ['../../outside.cjs', '/outside.cjs']) {
    const { root, cwd, captureCheck } = await fixture(t, 'capture-bin-');
    const directory = join(cwd, 'node_modules/oxfmt');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ bin }));
    writeFileSync(join(root, 'outside.cjs'), 'throw new Error("must not execute")');
    let calls = 0;
    assert.equal(captureCheck('format', { run() { calls++; } }), 2);
    assert.equal(calls, 0);
  }
  const { root, cwd, captureCheck } = await fixture(t, 'capture-package-');
  mkdirSync(join(root, 'outside'));
  symlinkSync(join(root, 'outside'), join(cwd, 'node_modules'), 'junction');
  let calls = 0;
  assert.equal(captureCheck('lint', { run() { calls++; } }), 2);
  assert.equal(calls, 0);
});

test('existing output symlinks cannot overwrite outside files', async (t) => {
  const { root, cwd, captureCheck } = await fixture(t, 'capture-output-');
  const outside = join(root, 'outside.txt');
  writeFileSync(outside, 'preserve me');
  try { symlinkSync(outside, join(cwd, 'format-status.json'), 'file'); }
  catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.skip('Windows account cannot create file symlinks; Linux CI exercises this case');
    return;
  }
  let calls = 0;
  assert.throws(() => captureCheck('format', { run() { calls++; } }), /symlinks/);
  assert.equal(calls, 0);
  assert.equal(readFileSync(outside, 'utf8'), 'preserve me');
  assert.equal(existsSync(join(cwd, 'oxfmt-output.txt')), false);
});


test('hard-linked outputs cannot overwrite outside evidence', async (t) => {
  for (const file of ['oxfmt-output.txt', 'format-status.json']) {
    const { root, cwd, captureCheck } = await fixture(t, 'capture-hardlink-');
    const outside = join(root, 'outside.txt');
    writeFileSync(outside, 'preserve me');
    linkSync(outside, join(cwd, file));
    let calls = 0;
    assert.throws(() => captureCheck('format', { run() { calls++; } }), /hard links/);
    assert.equal(calls, 0);
    assert.equal(readFileSync(outside, 'utf8'), 'preserve me');
  }
});


test('real CLI rejects malicious operations before any output or checker execution', async (t) => {
  const { root, cwd, script } = await fixture(t, 'capture-cli-');
  const outside = join(root, 'outside');
  mkdirSync(outside);
  for (const mode of ['../format', '../../outside/pwn', join(outside, 'pwn'), 'lint\n', '__proto__']) {
    const result = spawnSync(process.execPath, [script, mode], { cwd: outside, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown quality check/);
    assert.deepEqual(readdirSync(cwd), []);
    assert.deepEqual(readdirSync(outside), []);
  }
});
