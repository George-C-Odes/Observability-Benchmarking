import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadManifestTemplatePaths, parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths, syncPythonDefault } from './sync-framework-versions.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

test('canonical inventory covers exactly the active env version variables', () => {
  const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
  assert.deepEqual([...frameworkVersionKeys].sort(), Object.keys(variables).filter((key) => key.endsWith('_VERSION')).sort());
  assert.equal(new Set(frameworkVersionKeys).size, 12);
});

test('Python runtime default follows the env without changing action pins or caller overrides', () => {
  const original = readFileSync(resolveRepoPath('.github/actions/setup-python/action.yml'), 'utf8');
  const updated = syncPythonDefault(original, '3.14.2');
  assert.equal(updated, original.replace(/default: '[^']+'/m, "default: '3.14.2'"));
  assert.equal(syncPythonDefault(updated, '3.14.2'), updated);
  assert.equal(syncPythonDefault(original.replaceAll('\n', '\r\n'), '3.14.2'), updated.replaceAll('\n', '\r\n'));
  assert.throws(() => syncPythonDefault(original, '3.14.2rc1'), /stable/);
  assert.throws(() => syncPythonDefault('name: invalid\n', '3.14.2'), /Missing/);
});

test('generated allowlist includes all target classes, but never scripts or source templates', () => {
  const files = generatedFrameworkPaths();
  for (const file of [
    'utils/orchestrator/pom.xml', '.github/actions/setup-python/action.yml',
    '.github/go-tools/go.mod', 'services/python/django/gunicorn/dependencies.lock',
    'README.md', 'services/java/quarkus/native/pom.xml', '.github/requirements/python-ci.txt',
  ]) assert.ok(files.includes(file), file);
  assert.ok(files.some((file) => file.startsWith('.run/[build-img]')));
  assert.ok(files.every((file) => !file.includes('\\') && !file.includes('..') && !file.includes('.template.') && !file.startsWith('scripts/')));
  for (const file of files) assert.ok(readFileSync(resolveRepoPath(file)).length, file);
});

test('complete CLI relays changed env values, detects drift read-only, and is repeatable', (t) => {
  const workspace = temporaryDirectory(t, 'framework-pipeline-');
  const scripts = [
    'sync-framework-versions.mjs', 'sync-django-versions.mjs', 'sync-java-pom-versions.mjs',
    'sync-dockerfile-versions.mjs', 'sync-go-mod-versions.mjs', 'sync-build-img-runs.mjs',
    'sync-common.mjs', 'render-readmes.mjs', 'render-readmes.manifest.json',
  ];
  const files = [...new Set([
    'compose/.env', ...generatedFrameworkPaths(), ...loadManifestTemplatePaths('scripts/render-readmes.manifest.json'),
    ...scripts.map((file) => `scripts/${file}`),
  ])];
  for (const file of files) {
    const target = path.join(workspace, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(resolveRepoPath(file), target);
  }
  const envPath = path.join(workspace, 'compose/.env');
  const source = readFileSync(envPath, 'utf8')
    .replace(/^QUARKUS_VERSION:.*$/m, 'QUARKUS_VERSION: 9.0.1')
    .replace(/^GO_VERSION:.*$/m, 'GO_VERSION: 1.99.0')
    .replace(/^PYTHON_VERSION:.*$/m, 'PYTHON_VERSION: 3.13.99');
  writeFileSync(envPath, source);
  const snapshot = () => files.map((file) => readFileSync(path.join(workspace, file), 'utf8'));
  const before = snapshot();
  const run = (...args) => spawnSync(process.execPath, [path.join(workspace, 'scripts/sync-framework-versions.mjs'), ...args], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
  const stale = run('--check');
  assert.equal(stale.status, 1, stale.stderr);
  assert.deepEqual(snapshot(), before);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(envPath, 'utf8'), source);
  assert.match(readFileSync(path.join(workspace, 'utils/orchestrator/pom.xml'), 'utf8'), /<quarkus.platform.version>9\.0\.1/);
  assert.match(readFileSync(path.join(workspace, 'services/java/quarkus/native/pom.xml'), 'utf8'), /<quarkus.platform.version>9\.0\.1/);
  assert.match(readFileSync(path.join(workspace, '.github/go-tools/go.mod'), 'utf8'), /^go 1\.99\.0/m);
  assert.match(readFileSync(path.join(workspace, '.github/actions/setup-python/action.yml'), 'utf8'), /default: '3\.13\.99'/);
  assert.match(readFileSync(path.join(workspace, 'services/python/django/gunicorn/WSGI/Dockerfile'), 'utf8'), /ARG PYTHON_VERSION=3\.13\.99/);
  assert.match(readFileSync(path.join(workspace, 'services/README.md'), 'utf8'), /9\.0\.1/);
  const generated = snapshot();
  assert.equal(run('--check').status, 0);
  const repeat = run();
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /0 updated/);
  assert.deepEqual(snapshot(), generated);
});

