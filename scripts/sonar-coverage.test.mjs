import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inventory, normalizeGo, normalizeLcov, prepare, stage, workspacePath } from './sonar-coverage.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

const sha = 'a'.repeat(40);
function fixture(t) {
  return temporaryDirectory(t, 'sonar-coverage-');
}
function put(workspace, relative, content = 'data') {
  const location = path.join(workspace, relative);
  mkdirSync(path.dirname(location), { recursive: true });
  writeFileSync(location, content);
}
function populate(workspace) {
  put(workspace, '.sonarcloud.properties', readFileSync(new URL('../.sonarcloud.properties', import.meta.url)));
  put(workspace, 'sonar-project.properties', readFileSync(new URL('../sonar-project.properties', import.meta.url)));
  for (const [name, module] of Object.entries(inventory)) {
    if (name === 'django-common') continue;
    const directory = module.path;
    if (module.format === 'java') {
      put(workspace, `${directory}/target/site/jacoco/jacoco.xml`, '<report/>');
      for (const suffix of ['classes/Main.class', 'test-classes/MainTest.class', 'sonar-libraries/dependency.jar']) put(workspace, `${directory}/target/${suffix}`);
    } else if (module.format === 'go') {
      put(workspace, `${directory}/go.mod`, 'module example.org/benchmark\n');
      put(workspace, `${directory}/coverage.out`, 'mode: atomic\nexample.org/benchmark/cmd/server/main.go:1.1,2.1 1 1\n');
    } else if (module.format === 'python') put(workspace, `${directory}/coverage.xml`, '<coverage/>');
    else for (const environment of ['node', 'dom']) put(workspace, `${directory}/coverage/${environment}/lcov.info`, 'SF:app/page.tsx\nDA:1,1\nend_of_record\n');
    stage(workspace, name, sha);
  }
}

test('all modules stage separate reports and bytecode and prepare one same-revision scan', (t) => {
  const workspace = fixture(t);
  populate(workspace);
  const config = prepare(workspace, sha);
  for (const property of ['sonar.coverage.jacoco.xmlReportPaths', 'sonar.go.coverage.reportPaths', 'sonar.python.coverage.reportPaths', 'sonar.javascript.lcov.reportPaths', 'sonar.java.binaries', 'sonar.java.test.binaries', 'sonar.java.libraries']) {
    assert.match(config, new RegExp(`^${property.replaceAll('.', '\\.')}=.+`, 'm'));
  }
  assert.match(config, /sonar.sourceEncoding=UTF-8/);
  const pythonVersion = /^sonar.python.version=.+$/m.exec(readFileSync(new URL('../.sonarcloud.properties', import.meta.url), 'utf8'))[0];
  assert.ok(config.includes(pythonVersion));
  assert.match(config, /sonar.sources=\./);
  assert.match(config, /services\/java\/\*\*\/src\/test\/\*\*/);
  assert.equal(readFileSync(path.join(workspace, '.sonar/analysis.properties'), 'utf8'), `${config}\n`);
  assert.match(readFileSync(path.join(workspace, '.sonar/inputs/services/go/simple/coverage.out'), 'utf8'), /services\/go\/simple\/cmd\/server\/main.go:/);
  assert.match(readFileSync(path.join(workspace, '.sonar/inputs/utils/nextjs-dash/coverage/node/lcov.info'), 'utf8'), /SF:utils\/nextjs-dash\/app\/page.tsx/);
});

test('incomplete, empty, missing-bytecode and stale-revision collections cannot produce scanner settings', (t) => {
  for (const kind of ['missing report', 'empty report', 'missing bytecode', 'stale revision', 'missing module']) {
    const workspace = fixture(t);
    populate(workspace);
    const first = inventory['spring-tomcat'].path;
    if (kind === 'missing report') rmSync(path.join(workspace, `.sonar/inputs/${first}/target/site/jacoco/jacoco.xml`));
    if (kind === 'empty report') put(workspace, `.sonar/inputs/${first}/target/site/jacoco/jacoco.xml`, '');
    if (kind === 'missing bytecode') rmSync(path.join(workspace, `.sonar/inputs/${first}/target/classes/Main.class`));
    if (kind === 'stale revision') put(workspace, '.sonar/inputs/revisions/go-simple.json', JSON.stringify({ name: 'go-simple', revision: 'b'.repeat(40) }));
    if (kind === 'missing module') rmSync(path.join(workspace, '.sonar/inputs/revisions/go-simple.json'));
    assert.throws(() => prepare(workspace, sha), undefined, kind);
    assert.equal(existsSync(path.join(workspace, '.sonar/analysis.properties')), false, kind);
  }
});

test('unknown modules, invalid revisions and unsafe paths fail before output', (t) => {
  const workspace = fixture(t);
  for (const name of ['../go-simple', 'django-common', 'go-simple\n', '/tmp/module']) assert.throws(() => stage(workspace, name, sha), /Unknown/);
  for (const invalid of ['', `${sha}\n`, '../main']) assert.throws(() => stage(workspace, 'go-simple', invalid), /revision/);
  for (const relative of ['../outside', '/tmp/outside', 'C:/outside', 'nested/../../outside', 'nested\\outside', 'nested/line\nbreak']) assert.throws(() => workspacePath(workspace, relative), /Invalid/);
  assert.equal(existsSync(path.join(workspace, '.sonar')), false);
});

test('the CLI selects a fixed inventory output and rejects path-shaped module arguments', (t) => {
  const workspace = fixture(t);
  for (const file of ['sonar-coverage.mjs', 'coverage-thresholds.json']) {
    put(workspace, `scripts/${file}`, readFileSync(new URL(`./${file}`, import.meta.url)));
  }
  put(workspace, 'services/go/simple/go.mod', 'module hello\n');
  put(workspace, 'services/go/simple/coverage.out', 'mode: atomic\nhello/main.go:1.1,2.1 1 1\n');
  const run = (name) => spawnSync(process.execPath, ['scripts/sonar-coverage.mjs', 'stage', name], {
    cwd: workspace, env: { ...process.env, GITHUB_SHA: sha }, encoding: 'utf8', timeout: 10_000,
  });
  for (const name of ['../go-simple', 'go-simple/../../outside', 'go-simple\n', path.join(workspace, 'outside')]) {
    const result = run(name);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Unknown coverage module/);
    assert.equal(existsSync(path.join(workspace, '.sonar')), false);
  }
  const result = run('go-simple');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path.join(workspace, '.sonar/inputs/revisions/go-simple.json'), 'utf8')),
    { name: 'go-simple', revision: sha });
});

test('source and destination junctions cannot read or write outside the workspace', (t) => {
  for (const relative of ['.sonar', 'services/go/simple', '.sonar/inputs/revisions']) {
    const workspace = fixture(t);
    const outside = fixture(t);
    put(workspace, 'services/go/simple/go.mod', 'module hello\n');
    put(workspace, 'services/go/simple/coverage.out', 'mode: atomic\nhello/main.go:1.1,2.1 1 1\n');
    put(outside, 'sentinel', 'unchanged');
    const location = path.join(workspace, relative);
    if (existsSync(location)) rmSync(location, { recursive: true });
    mkdirSync(path.dirname(location), { recursive: true });
    symlinkSync(outside, location, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => stage(workspace, 'go-simple', sha), /Redirected/);
    assert.equal(readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'unchanged');
    assert.equal(existsSync(path.join(outside, 'inputs')), false);
    assert.equal(existsSync(path.join(outside, 'go-simple.json')), false);
    assert.equal(existsSync(path.join(workspace, '.sonar/inputs/services/go/simple/coverage.out')), false);
  }
});

test('Go and LCOV source paths retain their repository scope', (t) => {
  const workspace = fixture(t);
  const directory = 'utils/nextjs-dash';
  for (const source of ['app/page.tsx', `${directory}/app/page.tsx`, path.join(workspace, directory, 'app/page.tsx')]) {
    assert.equal(normalizeLcov(`SF:${source}\n`, workspace, directory), `SF:${directory}/app/page.tsx\n`);
  }
  for (const source of ['../../outside.ts', '/outside.ts', `${directory}/../outside.ts`]) assert.throws(() => normalizeLcov(`SF:${source}`, workspace, directory));
  for (const content of ['invalid', 'mode: atomic\nother/main.go:1.1,2.1 1 1', 'mode: atomic\nhello/../outside.go:1.1,2.1 1 1']) assert.throws(() => normalizeGo(content, 'hello', 'services/go/simple'));
});

test('coordinator owns all triggers, passes only Codecov to tests and reserves Sonar token for scan', () => {
  const coordinator = readFileSync(new URL('../.github/workflows/sonar.yml', import.meta.url), 'utf8');
  assert.match(coordinator, /needs: \[java, go, python, dashboard]/);
  assert.doesNotMatch(coordinator, /pull_request_target:|workflow_run:|secrets: inherit|run-id:/);
  assert.equal((coordinator.match(/secrets.SONAR_TOKEN/g) ?? []).length, 1);
  assert.match(coordinator, /fetch-depth: 0/);
  assert.match(coordinator, /head.repo.full_name == github.repository/);
  for (const file of ['java_coverage', 'go_coverage', 'django_python_coverage', 'nextjs_dash_quality']) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}.yml`, import.meta.url), 'utf8');
    assert.match(workflow, /^ {2}workflow_call:/m);
    assert.doesNotMatch(workflow, /^ {2}(?:push|pull_request|merge_group|schedule):/m);
    assert.match(workflow, /if-no-files-found: error/);
    assert.match(workflow, /include-hidden-files: 'true'/);
    assert.doesNotMatch(workflow, /SONAR_TOKEN|secrets: inherit/);
  }
});
