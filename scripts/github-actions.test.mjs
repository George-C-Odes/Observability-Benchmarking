import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { temporaryDirectory } from './test-helpers.mjs';

const githubDir = fileURLToPath(new URL('../.github/', import.meta.url));
const actions = [
  { name: 'setup-python', upstream: 'actions/setup-python', inputs: ['python-version', 'cache', 'cache-dependency-path'] },
  { name: 'setup-node', upstream: 'actions/setup-node', inputs: ['node-version', 'cache', 'cache-dependency-path'] },
  { name: 'setup-go', upstream: 'actions/setup-go', inputs: ['go-version-file', 'cache', 'cache-dependency-path'] },
  { name: 'codecov-upload', upstream: 'codecov/codecov-action', inputs: ['files', 'flags', 'name', 'token', 'fail_ci_if_error', 'disable_search'] },
];

function readYaml(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}

function yamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return entry.isFile() && /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

function references(source) {
  return [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
}

function localDependencies(source, dependencies = new Set()) {
  for (const reference of references(source)) {
    const match = /^\.\/\.github\/actions\/([a-z0-9-]+)$/.exec(reference);
    if (!match || dependencies.has(match[1])) continue;
    const name = match[1];
    dependencies.add(name);
    localDependencies(readYaml(join(githubDir, 'actions', name, 'action.yml')), dependencies);
  }
  return dependencies;
}

test('centralized action revisions occur only in their shared wrappers', () => {
  const sources = yamlFiles(githubDir).map((path) => ({ path, source: readYaml(path) }));
  for (const { name, upstream, inputs } of actions) {
    const wrapperPath = join(githubDir, 'actions', name, 'action.yml');
    const source = readYaml(wrapperPath);
    assert.match(source, /^ {2}using: composite$/m);
    const occurrences = sources.flatMap(({ path, source }) =>
      references(source).filter((ref) => ref.split('@')[0] === upstream).map((ref) => ({ path, ref })),
    );
    assert.equal(occurrences.length, 1, `${upstream} must have exactly one shared pin`);
    assert.equal(occurrences[0].path, wrapperPath, `${upstream} bypasses its wrapper`);
    assert.match(occurrences[0].ref.split('@')[1] ?? '', /^[a-f0-9]{40}$/, `${upstream} needs a full SHA`);
    assert.match(source, /^\s*uses: \S+@[a-f0-9]{40} +# v\d[^\r\n]*$/m);
    for (const input of inputs) {
      assert.ok(source.includes(`${input}: \${{ inputs.${input} }}`), `${name} must forward ${input}`);
    }
    assert.doesNotMatch(source, /\$\{\{\s*secrets\./, `${name} must receive secrets explicitly`);
  }
});

test('new wrappers preserve caller-selected execution and cache/upload defaults', () => {
  for (const name of ['setup-node', 'setup-go', 'codecov-upload']) {
    const source = readYaml(join(githubDir, 'actions', name, 'action.yml'));
    assert.match(source, /if: \$\{\{ always\(\) }}/, `${name} must respect callers running after failure`);
  }
  const node = readYaml(join(githubDir, 'actions', 'setup-node', 'action.yml'));
  assert.match(node, /node-version:\n[^\n]*\n {4}required: false\n {4}default: \'[\d.]+\'/);
  assert.match(node, /cache:\n[^\n]*\n {4}required: false\n {2}cache-dependency-path:/, 'Cache selection remains caller-controlled');
  const go = readYaml(join(githubDir, 'actions', 'setup-go', 'action.yml'));
  assert.match(go, /cache:\n[^\n]*\n {4}required: false\n {4}default: 'true'/);
  const codecov = readYaml(join(githubDir, 'actions', 'codecov-upload', 'action.yml'));
  assert.match(codecov, /fail_ci_if_error:\n[^\n]*\n {4}required: false\n {4}default: 'false'/);
  assert.match(codecov, /disable_search:\n[^\n]*\n {4}required: false\n {4}default: 'true'/);
});

test('path-filtered workflows include the shared actions they consume', () => {
  for (const path of yamlFiles(join(githubDir, 'workflows'))) {
    const source = readYaml(path);
    const dependencies = localDependencies(source);
    // Each paths block is checked separately so both push and PRs are covered.
    const filters = [...source.matchAll(/^ +paths:[ \t]*\r?\n((?: +-[^\r\n]*(?:\r?\n|$))+)/gm)];
    for (const name of [...actions.map(({ name }) => name), 'setup-nextjs']) {
      if (!dependencies.has(name)) continue;
      for (const [, filter] of filters) {
        assert.ok(
          filter.includes(`.github/actions/${name}/**`) || /['"]\.github\/actions\/\*\*['"]/.test(filter),
          `${path} must trigger on changes to ${name} in every paths filter`,
        );
      }
    }
  }
});

test('dashboard setup reuses Node setup and the manifest npm pin without lifecycle scripts', () => {
  const source = readYaml(join(githubDir, 'actions', 'setup-nextjs', 'action.yml'));
  assert.deepEqual(references(source), ['./.github/actions/setup-node']);
  assert.match(source, /node-version: \$\{\{ inputs.node-version }}/);
  assert.match(source, /cache: npm/);
  assert.match(source, /cache-dependency-path: utils\/nextjs-dash\/package-lock.json/);
  assert.match(source, /require\('\.\/package.json'\)\.packageManager/);
  assert.ok(source.includes(String.raw`^npm@[0-9]+\.[0-9]+\.[0-9]+$`));
  assert.match(source, /npm install --global --ignore-scripts "\$package_manager"/);
  assert.match(source, /run: npm ci --ignore-scripts/);
  assert.equal((source.match(/working-directory: \$\{\{ github.workspace }}\/utils\/nextjs-dash/g) ?? []).length, 2);
  assert.doesNotMatch(source, /always\(\)/, 'Install steps must not run after failed setup');
  const manifest = JSON.parse(readFileSync(new URL('../utils/nextjs-dash/package.json', import.meta.url), 'utf8'));
  assert.match(manifest.packageManager, /^npm@\d+\.\d+\.\d+$/);
  for (const name of ['nextjs_dash_quality', 'nextjs_dash_coverage']) {
    const workflow = readYaml(join(githubDir, 'workflows', `${name}.yml`));
    assert.ok(references(workflow).includes('./.github/actions/setup-nextjs'));
    assert.doesNotMatch(workflow, /npm install --global|npm ci/);
  }
});

test('dashboard setup rejects invalid npm pins before invoking npm', (t) => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  if (!existsSync(bash)) return t.skip('Bash is not installed');
  const root = temporaryDirectory(t, 'obbench-nextjs-setup-');
  const bin = join(root, 'bin');
  const log = join(root, 'npm.log');
  mkdirSync(bin);
  writeFileSync(join(bin, 'node'), '#!/usr/bin/env bash\nif [[ "$NODE_FAILURE" == true ]]; then exit 1; fi\nprintf "%s" "$PACKAGE_MANAGER"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'npm'), '#!/usr/bin/env bash\nprintf "%s\\n" "$@" >> "$NPM_LOG"\n', { mode: 0o755 });
  const action = readYaml(join(githubDir, 'actions', 'setup-nextjs', 'action.yml'));
  const body = /run: \|\n((?: {8}[^\n]*\n)+)/.exec(action)?.[1].replace(/^ {8}/gm, '');
  assert.ok(body, 'The bootstrap install command must be tested directly');
  const shellPath = (path) => path.replaceAll('\\', '/').replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`);
  const run = (packageManager, nodeFailure = false) => {
    writeFileSync(log, '');
    return spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `export PATH="$TEST_BIN:$PATH"\n${body}`], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, TEST_BIN: shellPath(bin), NPM_LOG: shellPath(log), PACKAGE_MANAGER: packageManager, NODE_FAILURE: String(nodeFailure) },
    });
  };
  const valid = run('npm@12.2.2');
  assert.equal(valid.error, undefined);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(readFileSync(log, 'utf8'), 'install\n--global\n--ignore-scripts\nnpm@12.2.2\n');
  for (const invalid of ['', 'npm@latest', 'npm@12.2.2\ninvalid', '--registry=untrusted', 'npm@12.2.2; touch marker', '$(touch marker)']) {
    const result = run(invalid);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, invalid);
    assert.equal(readFileSync(log, 'utf8'), '', `npm must not run for ${JSON.stringify(invalid)}`);
  }
  assert.notEqual(run('npm@12.2.2', true).status, 0);
  assert.equal(readFileSync(log, 'utf8'), '');
  assert.equal(existsSync(join(root, 'marker')), false);
});

test('Go quality matrix preserves independent checks and Pages artifact contracts', () => {
  const source = readYaml(join(githubDir, 'workflows', 'go_quality.yml'));
  assert.match(source, /name: \$\{\{ matrix.check_name }}/);
  assert.match(source, /fail-fast: false/);
  assert.match(source, /go-version-file: \$\{\{ matrix.module_dir }}\/go.mod/);
  assert.match(source, /REPORT_TITLE: \$\{\{ matrix.report_title }}/);
  assert.match(source, /name: \$\{\{ matrix.artifact_name }}/);
  assert.match(source, /path: \$\{\{ matrix.module_dir }}\/quality-report\//);
  const entries = [...source.matchAll(/- module_dir: ([^\n]+)\n +check_name: ([^\n]+)\n +report_title: ([^\n]+)\n +artifact_name: ([^\n]+)/g)];
  assert.deepEqual(entries.map((entry) => entry.slice(1)), [
    ['services/go/enhanced', 'Enhanced — lint, vet & test', 'Go Enhanced Service', 'quality-report-go'],
    ['services/go/simple', 'Simple — lint, vet, test & build', 'Go Simple Service', 'quality-report-go-simple'],
  ]);
  const pages = readYaml(join(githubDir, 'workflows', 'pages.yml'));
  for (const entry of entries) assert.ok(pages.includes(`name: ${entry[4]}\n`));
  assert.equal((source.match(/uses: golangci\/golangci-lint-action@/g) ?? []).length, 1);
  assert.match(source, /install-mode: none/);
  assert.match(source, /install-only: true/);
  assert.match(source, /node --test scripts\/golangci-lint-asset.test.mjs/);
  assert.equal(source.split("- 'scripts/golangci-lint-asset*.mjs'").length - 1, 2);
});

test('coverage helper consumers trigger on helper changes and CI runs its unit tests', () => {
  for (const [workflow, formats] of [
    ['django_python_coverage', ['python']], ['go_coverage', ['go']],
    ['java_coverage', ['java', 'java-combined']], ['nextjs_dash_coverage', ['nextjs']],
  ]) {
    const source = readYaml(join(githubDir, 'workflows', `${workflow}.yml`));
    for (const format of formats) assert.ok(source.includes(`coverage_summary.py" ${format}\n`));
    for (const path of ['scripts/coverage_summary.py', 'scripts/test_coverage_summary.py']) {
      assert.equal(source.split(`- '${path}'`).length - 1, 2, `${workflow} needs push and PR helper triggers`);
    }
  }
  const check = readYaml(join(githubDir, 'workflows', 'framework_versions.yml'));
  assert.match(check, /python -m unittest discover -s scripts -p test_coverage_summary.py -v/);
});
