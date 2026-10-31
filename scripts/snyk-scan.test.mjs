import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runScan, scanArguments, scanFiles, scanResult } from './snyk-scan.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

function fixtureRoot(t, prefix) {
  // Private mkdtemp directory; every fixture filename below is a literal.
  return pathToFileURL(`${temporaryDirectory(t, prefix)}${path.sep}`);
}

test('scan arguments retain deep source coverage without skipping unresolved dependencies', () => {
  for (const mode of ['test', 'monitor']) {
    const args = scanArguments(mode);
    assert.equal(args[0], mode);
    assert.ok(args.includes('--all-projects'));
    assert.ok(args.includes('--detection-depth=8'));
    assert.ok(args.includes('--command=python'));
    assert.ok(!args.includes('--skip-unresolved'));
    const excluded = args.find((arg) => arg.startsWith('--exclude=')).slice('--exclude='.length).split(',');
    assert.ok(excluded.includes('node_modules'));
    assert.ok(excluded.includes('vendor'));
    assert.ok(!excluded.includes('.github'));
    assert.ok(!excluded.includes('native'));
  }
  const args = scanArguments('test');
  assert.ok(args.includes('--fail-fast'));
  assert.ok(args.includes('--json-file-output=snyk-results/test.json'));
  assert.ok(args.includes('--sarif-file-output=snyk-results/test.sarif'));
  assert.deepEqual(scanArguments('code'), [
    'code', 'test', '--sarif-file-output=snyk-results/code.sarif',
  ]);
});

test('exit codes distinguish findings, errors, unsupported projects, and monitor failure', () => {
  for (const mode of ['code', 'test', 'monitor']) {
    assert.equal(scanResult(mode, 0), 'clean');
    assert.equal(scanResult(mode, 1), mode === 'monitor' ? 'error' : 'findings');
    for (const code of [2, 3, 127, null]) assert.equal(scanResult(mode, code), 'error');
  }
  assert.throws(() => scanArguments('unknown'), /Unknown Snyk scan mode/);
  assert.throws(() => scanResult('unknown', 0), /Unknown Snyk scan mode/);
});

test('artifact paths are fixed and reject traversal and inherited property names', (t) => {
  const root = fixtureRoot(t, 'snyk-paths-');
  const files = scanFiles('test', fileURLToPath(root));
  assert.equal(files.directory.href, new URL('snyk-results/', root).href);
  assert.equal(files.log.href, new URL('snyk-results/test.log', root).href);
  assert.equal(files.status.href, new URL('snyk-results/test-status.json', root).href);
  assert.equal(files.json.href, new URL('snyk-results/test.json', root).href);
  assert.equal(files.sarif.href, new URL('snyk-results/test.sarif', root).href);
  for (const mode of ['../test', '..\\test', '/test', 'C:\\test', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => scanFiles(mode, fileURLToPath(root)), /Unknown Snyk scan mode/);
    assert.throws(() => scanArguments(mode), /Unknown Snyk scan mode/);
  }
  for (const directory of ['', '.', '../outside', '..\\outside', 'C:outside', null, 42]) {
    assert.throws(() => scanFiles('test', directory), /absolute host-selected path/);
  }
  assert.ok(!existsSync(files.directory));
});

for (const [mode, exitCode] of [['code', 0], ['code', 1], ['test', 1], ['test', 2], ['test', 3], ['monitor', 1]]) {
  test(`${mode} exit ${exitCode}: preserve logs, reports, status, and Actions outputs`, async (t) => {
    const root = fixtureRoot(t, 'snyk-scan-');
    const fakeCli = new URL('fake-snyk.mjs', root);
    writeFileSync(fakeCli, `
      import { writeFileSync } from 'node:fs';
      console.log('Fake Snyk stdout');
      console.error('Fake Snyk stderr');
      for (const arg of process.argv.slice(2)) {
        if (arg === '--json-file-output=snyk-results/test.json') writeFileSync('snyk-results/test.json', '{}');
        if (arg === '--sarif-file-output=snyk-results/test.sarif') writeFileSync('snyk-results/test.sarif', '{}');
        if (arg === '--sarif-file-output=snyk-results/code.sarif') writeFileSync('snyk-results/code.sarif', '{}');
      }
      process.exitCode = ${exitCode};
    `);
    const outputPath = new URL('output', root);
    const summaryPath = new URL('summary', root);
    const workingDirectory = fileURLToPath(root);
    const files = scanFiles(mode, workingDirectory);
    const expectedResult = scanResult(mode, exitCode);
    let diagnostics = '';
    const result = await runScan(mode, {
      workingDirectory, outputPath, summaryPath,
      executable: process.execPath, prefixArgs: [fileURLToPath(fakeCli)],
      stdout: { write() {} },
      stderr: { write(chunk) { diagnostics += chunk; } },
    });
    assert.deepEqual(result, { exitCode, result: expectedResult });
    if (expectedResult === 'findings') assert.match(diagnostics, /reported security findings/);
    if (expectedResult === 'error') assert.match(diagnostics, /failed to complete/);
    if (expectedResult === 'clean') assert.ok(!diagnostics.includes('::error::'));
    const log = readFileSync(files.log, 'utf8');
    assert.match(log, /Fake Snyk stdout/);
    assert.match(log, /Fake Snyk stderr/);
    assert.deepEqual(JSON.parse(readFileSync(files.status, 'utf8')),
      { mode, exitCode, result: expectedResult });
    assert.equal(readFileSync(outputPath, 'utf8'), `exit-code=${exitCode}\nresult=${expectedResult}\n`);
    assert.ok(readFileSync(summaryPath, 'utf8').includes(`**${expectedResult}** (exit code ${exitCode})`));
    if (mode !== 'monitor') {
      assert.equal(readFileSync(files.sarif, 'utf8'), '{}');
    }
    if (mode === 'test') assert.equal(readFileSync(files.json, 'utf8'), '{}');
  });
}

test('a missing Snyk executable fails closed with retained diagnostics', async (t) => {
  const root = fixtureRoot(t, 'snyk-missing-');
  const workingDirectory = fileURLToPath(root);
  const result = await runScan('test', {
    workingDirectory,
    executable: fileURLToPath(new URL('missing-snyk', root)),
    outputPath: null, summaryPath: null,
    stdout: { write() {} }, stderr: { write() {} },
  });
  assert.deepEqual(result, { exitCode: 2, result: 'error' });
  assert.match(readFileSync(scanFiles('test', workingDirectory).log, 'utf8'), /could not complete/);
});

test('an artifact directory symlink cannot redirect reports outside the cwd', async (t) => {
  const root = fixtureRoot(t, 'snyk-directory-link-');
  const outside = fixtureRoot(t, 'snyk-outside-');
  const files = scanFiles('test', fileURLToPath(root));
  // A Windows junction is a directory symlink that does not require admin rights.
  symlinkSync(fileURLToPath(outside), fileURLToPath(files.directory), 'junction');
  await assert.rejects(runScan('test', { workingDirectory: fileURLToPath(root) }), /Unsafe Snyk artifact target/);
  assert.ok(!existsSync(new URL('test.log', outside)));
});

for (const key of ['log', 'status', 'json', 'sarif']) {
  test(`a hard-linked ${key} artifact cannot overwrite another file`, async (t) => {
    const root = fixtureRoot(t, 'snyk-file-link-');
    const files = scanFiles('test', fileURLToPath(root));
    mkdirSync(files.directory);
    const protectedFile = new URL('protected.txt', root);
    writeFileSync(protectedFile, 'must not change');
    linkSync(protectedFile, files[key]);
    await assert.rejects(runScan('test', { workingDirectory: fileURLToPath(root) }), /Unsafe Snyk artifact target/);
    assert.equal(readFileSync(protectedFile, 'utf8'), 'must not change');
  });
}

test('CLI rejects invalid modes with scan-error exit code', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./snyk-scan.mjs', import.meta.url)), 'invalid'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown Snyk scan mode/);
});

test('workflow keeps required scans gated and snapshots restricted to trusted main', () => {
  const workflow = readFileSync(new URL('../.github/workflows/snyk-security.yml', import.meta.url), 'utf8');
  for (const mode of ['code', 'test', 'monitor']) {
    assert.ok(workflow.includes(`node scripts/snyk-scan.mjs ${mode}`));
  }
  assert.match(workflow, /github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /CODE_OUTCOME: \$\{\{ steps\.snyk-code\.outcome }}/);
  assert.match(workflow, /TEST_OUTCOME: \$\{\{ steps\.snyk-open-source-test\.outcome }}/);
  assert.match(workflow, /"\$CODE_OUTCOME" != "success"/);
  assert.match(workflow, /"\$TEST_OUTCOME" != "success"/);
  assert.match(workflow, /"\$MONITOR_OUTCOME" == "failure"/);
});
