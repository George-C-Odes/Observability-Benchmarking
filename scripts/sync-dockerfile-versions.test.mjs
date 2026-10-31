import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { resolveRepoPath } from './render-readmes.mjs';
import { temporaryDirectory } from './test-helpers.mjs';
import { dockerfileVersions, syncDockerfileContent, syncDockerfileVersions } from './sync-dockerfile-versions.mjs';

test('every service Dockerfile changes only its managed default and is repeatable', () => {
  let count = 0;
  for (const { key, modules } of dockerfileVersions) {
    for (const module of modules) {
      const original = readFileSync(resolveRepoPath(`services/${module}/Dockerfile`), 'utf8');
      const actual = syncDockerfileContent(original, key, '91.3.5-RC1');
      assert.equal(actual, original.replace(new RegExp(`(ARG ${key}=)[^\\r\\n]+`), '$191.3.5-RC1'), module);
      assert.equal(syncDockerfileContent(actual, key, '91.3.5-RC1'), actual, module);
      count += 1;
    }
  }
  assert.equal(count, 19);
});

test('comments, CRLF, stage redeclarations, image references and tooling versions are preserved', () => {
  const original = '# ARG GO_VERSION=0.0.0\r\nARG GO_VERSION=1.2.3 # default\r\nFROM golang:${GO_VERSION} AS builder\r\nARG GO_VERSION\r\nARG OTEL_JAVA_AGENT_VERSION=2.33.1\r\nUSER nonroot\r\n';
  assert.equal(syncDockerfileContent(original, 'GO_VERSION', '2.3.4'), original.replace('=1.2.3', '=2.3.4'));
  assert.equal(syncDockerfileContent('  arg GO_VERSION = 1.2.3  \n', 'GO_VERSION', '2.3.4'), '  arg GO_VERSION = 2.3.4  \n');
});

test('missing or duplicate defaults and invalid inputs fail without guessing', () => {
  for (const content of ['ARG GO_VERSION\n', '# ARG GO_VERSION=1\n', 'ARG OTHER_GO_VERSION=1\n', 'ARG GO_VERSION=1\nARG GO_VERSION=2\n']) {
    assert.throws(() => syncDockerfileContent(content, 'GO_VERSION', '3'), /Expected exactly one ARG GO_VERSION default/);
  }
  assert.throws(() => syncDockerfileContent('', 'GO.*', '3'), /Invalid version argument/);
  for (const version of [undefined, '', '3 # comment', '"3"', '${VERSION}', '3\nRUN anything']) {
    assert.throws(() => syncDockerfileContent('ARG GO_VERSION=1', 'GO_VERSION', version), /Missing or invalid version/);
  }
});

function fixture(t) {
  const directory = temporaryDirectory(t, 'sync-dockerfile-versions-');
  const envPath = path.join(directory, '.env');
  const servicesDirectory = path.join(directory, 'services');
  const originals = new Map();
  const envLines = [];
  for (const [index, { key, modules }] of dockerfileVersions.entries()) {
    envLines.push(`#${key}: 0.0.0`, `${key}: 91.${index}.5`);
    for (const module of modules) {
      const filePath = path.join(servicesDirectory, module, 'Dockerfile');
      mkdirSync(path.dirname(filePath), { recursive: true });
      const original = `ARG ${key}=1.2.3\r\nFROM example:latest\r\nUSER nonroot\r\n`;
      writeFileSync(filePath, original);
      originals.set(filePath, original);
    }
  }
  writeFileSync(envPath, envLines.join('\r\n'));
  return { envPath, servicesDirectory, originals };
}

test('check mode detects drift without writes and generation uses each env key', (t) => {
  const options = fixture(t);
  assert.throws(() => syncDockerfileVersions({ ...options, check: true }), /Dockerfile versions are out of date/);
  for (const [file, original] of options.originals) assert.equal(readFileSync(file, 'utf8'), original);
  const results = syncDockerfileVersions(options);
  assert.equal(results.length, 19);
  assert.ok(results.every(({ changed }) => changed));
  for (const [index, { key, modules }] of dockerfileVersions.entries()) {
    for (const module of modules) {
      const filePath = path.join(options.servicesDirectory, module, 'Dockerfile');
      assert.equal(readFileSync(filePath, 'utf8'), options.originals.get(filePath).replace('1.2.3', `91.${index}.5`), key);
    }
  }
  assert.ok(syncDockerfileVersions({ ...options, check: true }).every(({ changed }) => !changed));
  assert.ok(syncDockerfileVersions(options).every(({ changed }) => !changed));
});

test('missing env values and malformed Dockerfiles prevent writes to the entire batch', (t) => {
  const options = fixture(t);
  const env = readFileSync(options.envPath, 'utf8');
  writeFileSync(options.envPath, env.replace(/^PYTHON_VERSION:.*$/m, ''));
  assert.throws(() => syncDockerfileVersions(options), /PYTHON_VERSION/);
  for (const [file, original] of options.originals) assert.equal(readFileSync(file, 'utf8'), original);
  writeFileSync(options.envPath, env);
  const malformed = path.join(options.servicesDirectory, 'python/django/gunicorn/WSGI/Dockerfile');
  writeFileSync(malformed, 'ARG PYTHON_VERSION\n');
  assert.throws(() => syncDockerfileVersions(options), /WSGI.*Dockerfile:.*ARG PYTHON_VERSION default/);
  for (const [file, original] of options.originals) {
    if (file !== malformed) assert.equal(readFileSync(file, 'utf8'), original);
  }
});
