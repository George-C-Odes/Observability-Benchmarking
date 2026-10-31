import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runScan, scanArguments, scanFiles, scanResult } from './snyk-scan.mjs';
import { mergeSnykSarif } from './snyk-sarif.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

function fixtureRoot(t, prefix) {
  // Private mkdtemp directory; every fixture filename below is a literal.
  return pathToFileURL(`${temporaryDirectory(t, prefix)}${path.sep}`);
}

function dependencySarif() {
  const rule = (id, project) => ({
    id, shortDescription: { text: id }, fullDescription: { text: 'Vulnerable dependency' },
    help: { text: '', markdown: `Introduced through ${project}` },
    properties: { tags: ['security'], 'security-severity': '7.5' },
  });
  const result = (ruleId, ruleIndex, uri) => ({
    ruleId, ruleIndex, message: { text: 'Vulnerable dependency' }, level: 'error',
    locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: 1 } } }],
    partialFingerprints: { primaryLocationLineHash: uri },
  });
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'Snyk Open Source', version: '1.1308.3',
          rules: [rule('SNYK-A', 'project-a'), rule('SNYK-B', 'project-a')],
          properties: { artifactsScanned: 10 } } },
        automationDetails: { id: 'Snyk/Open Source/hello/timestamp' },
        results: [result('SNYK-A', 0, 'services/a/pom.xml')],
      },
      {
        tool: { driver: { name: 'Snyk Open Source', version: '1.1308.3',
          rules: [rule('SNYK-B', 'project-b'), rule('SNYK-A', 'project-b')],
          properties: { artifactsScanned: 20 } } },
        automationDetails: { id: 'Snyk/Open Source/hello/timestamp' },
        results: [{ ...result('SNYK-B', 0, 'services/b/pom.xml'), rule: { id: 'SNYK-B', index: 0 } }],
      },
    ],
  };
}

test('dependency SARIF consolidates duplicate categories without losing findings or rule references', () => {
  const raw = dependencySarif();
  const original = structuredClone(raw);
  const merged = mergeSnykSarif(raw);
  assert.deepEqual(raw, original);
  assert.equal(merged.runs.length, 1);
  const run = merged.runs[0];
  assert.equal(run.automationDetails.id, 'snyk-open-source/');
  assert.equal(run.tool.driver.properties.artifactsScanned, 30);
  assert.deepEqual(run.tool.driver.rules.map((rule) => rule.id), ['SNYK-A', 'SNYK-B']);
  assert.deepEqual(run.results[0], raw.runs[0].results[0]);
  assert.deepEqual(run.results[1], { ...raw.runs[1].results[0], ruleIndex: 1,
    rule: { id: 'SNYK-B', index: 1 } });
  for (const rule of run.tool.driver.rules) {
    assert.match(rule.help.markdown, /project-a/);
    assert.match(rule.help.markdown, /project-b/);
    assert.equal(rule.properties['security-severity'], '7.5');
  }
  assert.deepEqual(mergeSnykSarif(merged), merged);
});

test('dependency SARIF remaps explicit driver references and rejects unsupported rule references', () => {
  const raw = dependencySarif();
  raw.runs[1].results[0].rule.toolComponent = { index: -1 };
  assert.deepEqual(mergeSnykSarif(raw).runs[0].results[1].rule,
    { id: 'SNYK-B', index: 1, toolComponent: { index: -1 } });
  raw.runs[1].results[0].rule.toolComponent = { index: 0 };
  assert.throws(() => mergeSnykSarif(raw), /unsupported result rule toolComponent/);
  const invocations = dependencySarif();
  for (const run of invocations.runs) run.invocations = [{ executionSuccessful: true }];
  assert.throws(() => mergeSnykSarif(invocations), /unsupported run-local rule references/);
});

test('dependency SARIF supports more than 20 projects and retains clean runs', () => {
  const raw = dependencySarif();
  raw.runs = Array.from({ length: 25 }, () => structuredClone(raw.runs[0]));
  assert.equal(mergeSnykSarif(raw).runs[0].results.length, 25);
  for (const run of raw.runs) { run.results = []; run.tool.driver.rules = []; }
  const clean = mergeSnykSarif(raw);
  assert.equal(clean.runs.length, 1);
  assert.deepEqual(clean.runs[0].results, []);
  assert.deepEqual(clean.runs[0].tool.driver.rules, []);
});

test('dependency SARIF rejects incompatible metadata and invalid rule indexes', () => {
  for (const raw of [null, {}, { version: '2.1.0', runs: [] }, { version: '2.0.0', runs: [] }]) {
    assert.throws(() => mergeSnykSarif(raw), /Cannot consolidate Snyk SARIF/);
  }
  const metadata = dependencySarif();
  metadata.runs[1].originalUriBaseIds = { SRC: { uri: 'file:///other/' } };
  assert.throws(() => mergeSnykSarif(metadata), /incompatible run or tool metadata/);
  const index = dependencySarif();
  index.runs[1].results[0].ruleIndex = 99;
  assert.throws(() => mergeSnykSarif(index), /invalid rule index/);
  const conflict = dependencySarif();
  conflict.runs[1].tool.driver.rules[0].properties['security-severity'] = '9.8';
  assert.throws(() => mergeSnykSarif(conflict), /conflicting rule/);
});

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
  assert.equal(files.githubSarif.href, new URL('snyk-results/test-github.sarif', root).href);
  for (const mode of ['../test', '..\\test', '/test', 'C:\\test', 'constructor', '__proto__', 'toString']) {
    assert.throws(() => scanFiles(mode, fileURLToPath(root)), /Unknown Snyk scan mode/);
    assert.throws(() => scanArguments(mode), /Unknown Snyk scan mode/);
  }
  for (const directory of ['', '.', '../outside', '..\\outside', 'C:outside', null, 42]) {
    assert.throws(() => scanFiles('test', directory), /absolute host-selected path/);
  }
  assert.ok(!existsSync(files.directory));
});

for (const [mode, exitCode] of [['code', 0], ['code', 1], ['test', 0], ['test', 1], ['test', 2], ['test', 3], ['monitor', 1]]) {
  test(`${mode} exit ${exitCode}: preserve logs, reports, status, and Actions outputs`, async (t) => {
    const root = fixtureRoot(t, 'snyk-scan-');
    const fakeCli = new URL('fake-snyk.mjs', root);
    const report = dependencySarif();
    if (exitCode === 0) for (const run of report.runs) run.results = [];
    const rawSarif = JSON.stringify(report);
    const rawJson = JSON.stringify({ vulnerabilities: exitCode === 0 ? [] : [
      { id: 'SNYK-A', severity: 'high', title: 'Vulnerable library', packageName: 'example-library', fixedIn: ['2.0'] },
    ] });
    writeFileSync(fakeCli, `
      import { writeFileSync } from 'node:fs';
      console.log('Fake Snyk stdout');
      console.error('Fake Snyk stderr');
      for (const arg of process.argv.slice(2)) {
        if (arg === '--json-file-output=snyk-results/test.json') {
          writeFileSync('snyk-results/test.json', ${JSON.stringify(rawJson)});
        }
        if (arg === '--sarif-file-output=snyk-results/test.sarif') {
          writeFileSync('snyk-results/test.sarif', ${JSON.stringify(rawSarif)});
        }
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
    if (expectedResult === 'findings') assert.match(diagnostics, /^::warning title=.*reported security findings/m);
    if (expectedResult === 'error') assert.match(diagnostics, /^::error title=.*failed to complete/m);
    if (expectedResult === 'clean') assert.ok(!diagnostics.includes('::error'));
    const log = readFileSync(files.log, 'utf8');
    assert.match(log, /Fake Snyk stdout/);
    assert.match(log, /Fake Snyk stderr/);
    assert.deepEqual(JSON.parse(readFileSync(files.status, 'utf8')),
      { mode, exitCode, result: expectedResult });
    assert.equal(readFileSync(outputPath, 'utf8'), `exit-code=${exitCode}\nresult=${expectedResult}\n`);
    assert.ok(readFileSync(summaryPath, 'utf8').includes(`**${expectedResult}** (exit code ${exitCode})`));
    if (mode === 'code') assert.equal(readFileSync(files.sarif, 'utf8'), '{}');
    if (mode === 'test') {
      assert.equal(readFileSync(files.sarif, 'utf8'), rawSarif);
      assert.deepEqual(JSON.parse(readFileSync(files.githubSarif, 'utf8')), mergeSnykSarif(report));
      assert.equal(readFileSync(files.json, 'utf8'), rawJson);
      const summary = readFileSync(summaryPath, 'utf8');
      assert.match(summary, /\| Severity \| Unique issues \| Occurrences \|/);
      assert.match(summary, /Dependency projects reported: \*\*2\*\*/);
      if (expectedResult === 'findings') {
        assert.match(diagnostics, /2 unique issues; 2 occurrences across 2 affected files/);
        assert.match(diagnostics, /fixed in 2\.0/);
        assert.match(summary, /example-library/);
      }
    }
  });
}

for (const raw of ['{', '{}', null]) {
  test(`invalid or missing dependency SARIF (${raw}) fails closed with retained diagnostics`, async (t) => {
    const root = fixtureRoot(t, 'snyk-invalid-sarif-');
    const fakeCli = new URL('fake-snyk.mjs', root);
    writeFileSync(fakeCli, `
      import { writeFileSync } from 'node:fs';
      console.log('Fake Snyk scan completed');
      ${raw === null ? '' : `writeFileSync('snyk-results/test.sarif', ${JSON.stringify(raw)});`}
    `);
    const files = scanFiles('test', fileURLToPath(root));
    mkdirSync(files.directory);
    writeFileSync(files.sarif, JSON.stringify(dependencySarif()));
    writeFileSync(files.githubSarif, JSON.stringify(mergeSnykSarif(dependencySarif())));
    const outputPath = new URL('output', root);
    const summaryPath = new URL('summary', root);
    const result = await runScan('test', {
      workingDirectory: fileURLToPath(root), outputPath, summaryPath,
      executable: process.execPath, prefixArgs: [fileURLToPath(fakeCli)],
      stdout: { write() {} }, stderr: { write() {} },
    });
    assert.deepEqual(result, { exitCode: 2, result: 'error' });
    assert.ok(!existsSync(files.githubSarif));
    assert.match(readFileSync(files.log, 'utf8'), /SARIF preparation failed/);
    assert.deepEqual(JSON.parse(readFileSync(files.status, 'utf8')), { mode: 'test', ...result });
    assert.equal(readFileSync(outputPath, 'utf8'), 'exit-code=2\nresult=error\n');
    assert.match(readFileSync(summaryPath, 'utf8'), /\*\*error\*\*/);
    if (raw !== null) assert.equal(readFileSync(files.sarif, 'utf8'), raw);
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
  // Linux requires the new symlink path to have no trailing directory separator.
  symlinkSync(path.resolve(fileURLToPath(outside)), path.resolve(fileURLToPath(files.directory)), 'junction');
  await assert.rejects(runScan('test', { workingDirectory: fileURLToPath(root) }), /Unsafe Snyk artifact target/);
  assert.ok(!existsSync(new URL('test.log', outside)));
});

for (const key of ['log', 'status', 'json', 'sarif', 'githubSarif']) {
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
  assert.match(workflow, /hashFiles\('snyk-results\/test-github\.sarif'\)/);
  assert.match(workflow, /sarif_file: snyk-results\/test-github\.sarif/);
  assert.ok(!workflow.includes('sarif_file: snyk-results/test.sarif'));
  assert.match(workflow, /scan_completed "\$CODE_RESULT" "\$CODE_OUTCOME"/);
  assert.match(workflow, /scan_completed "\$TEST_RESULT" "\$TEST_OUTCOME"/);
  assert.match(workflow, /"\$MONITOR_OUTCOME" == "failure"/);
  assert.match(workflow, /node --test scripts\/snyk-scan\.test\.mjs scripts\/snyk-report\.test\.mjs/);
  assert.ok(!workflow.includes('echo "::error::Snyk reported findings or incomplete scans.'));
  assert.match(workflow, /\| Scan \| Result \| Step outcome \|/);
});

test('workflow scan steps normalize only findings and the gate warns without hiding scan failures', (t) => {
  const bash = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  if (bash.error?.code === 'ENOENT') {
    t.skip('Bash is required to execute the workflow gate regression test');
    return;
  }
  assert.equal(bash.status, 0, bash.error?.message || bash.stderr);
  const workflow = readFileSync(new URL('../.github/workflows/snyk-security.yml', import.meta.url), 'utf8');
  for (const mode of ['code', 'test']) {
    const command = workflow.match(new RegExp(`run: (node scripts/snyk-scan\\.mjs ${mode}[^\\r\\n]*)`))?.[1];
    assert.ok(command, `Missing ${mode} scan command`);
    for (const exitCode of [0, 1, 2, 3, 127]) {
      const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c',
        `node() { return ${exitCode}; }\n${command}`], { encoding: 'utf8' });
      assert.equal(result.status, exitCode <= 1 ? 0 : 1, `${mode} exit ${exitCode}: ${result.stderr}`);
    }
  }
  const script = workflow.match(/- name: Enforce Snyk security gate[\s\S]*? {8}run: \|\r?\n([\s\S]*)$/)?.[1]
    .replace(/^ {10}/gm, '').replace(/\r/g, '');
  assert.ok(script, 'Missing security gate script');
  const root = fixtureRoot(t, 'snyk-gate-');
  const summaryPath = new URL('summary', root);
  const defaults = {
    SNYK_TOKEN: 'test-token', CODE_RESULT: 'clean', CODE_OUTCOME: 'success',
    TEST_RESULT: 'clean', TEST_OUTCOME: 'success', MONITOR_RESULT: '', MONITOR_OUTCOME: 'skipped',
    GITHUB_STEP_SUMMARY: fileURLToPath(summaryPath).replace(/\\/g, '/'),
  };
  const cases = [];
  for (const code of ['clean', 'findings']) {
    for (const dependencies of ['clean', 'findings']) {
      for (const monitor of ['skipped', 'success', 'failure']) {
        cases.push({ env: { CODE_RESULT: code, TEST_RESULT: dependencies, MONITOR_OUTCOME: monitor,
          MONITOR_RESULT: monitor === 'success' ? 'clean' : monitor === 'failure' ? 'error' : '' },
        status: monitor === 'failure' ? 1 : 0,
        summary: monitor === 'failure' ? '**Blocked:**' : code === 'findings' || dependencies === 'findings'
          ? '**Warning:**' : '**Passed:**' });
      }
    }
  }
  for (const scan of ['CODE', 'TEST']) {
    for (const [result, outcome] of [['error', 'failure'], ['', 'failure'], ['', 'success'],
      ['findings', 'failure'], ['findings', 'skipped'], ['findings', 'cancelled'],
      ['clean', 'failure'], ['clean', 'skipped'], ['error', 'success'], ['unknown', 'success']]) {
      cases.push({ env: { [`${scan}_RESULT`]: result, [`${scan}_OUTCOME`]: outcome },
        status: 1, summary: '**Blocked:**' });
    }
  }
  cases.push({ env: { CODE_RESULT: 'findings', TEST_RESULT: 'error', TEST_OUTCOME: 'failure' },
    status: 1, summary: '**Blocked:**' });
  cases.push({ env: { SNYK_TOKEN: '', CODE_RESULT: '', CODE_OUTCOME: 'skipped',
    TEST_RESULT: '', TEST_OUTCOME: 'skipped' }, status: 0, summary: 'Snyk scans skipped' });
  for (const scenario of cases) {
    writeFileSync(summaryPath, '');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: fileURLToPath(root), env: { ...process.env, ...defaults, ...scenario.env }, encoding: 'utf8',
    });
    assert.equal(result.status, scenario.status, `${JSON.stringify(scenario.env)}: ${result.stderr}`);
    assert.ok(readFileSync(summaryPath, 'utf8').includes(scenario.summary), JSON.stringify(scenario.env));
  }
});
