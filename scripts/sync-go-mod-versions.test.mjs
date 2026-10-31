import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { resolveRepoPath } from './render-readmes.mjs';
import { temporaryDirectory } from './test-helpers.mjs';
import { goModules, syncGoModContent, syncGoModVersions } from './sync-go-mod-versions.mjs';

test('all repository modules change only their Go version and are repeatable', () => {
  for (const module of goModules) {
    const original = readFileSync(resolveRepoPath(`${module}/go.mod`), 'utf8');
    const actual = syncGoModContent(original, '1.28.0');
    assert.equal(actual, original.replace(/^go \S+/m, 'go 1.28.0'), module);
    assert.equal(syncGoModContent(actual, '1.28.0'), actual);
  }
});

test('preserves comments, CRLF, dependency/tool locks and optional toolchain policy', () => {
  const original = '// go 1.20.0\r\nmodule example\r\n\r\n  go\t1.27.2 // minimum\r\ntoolchain go1.27.2 // preferred\r\ntool example.org/scanner\r\nrequire example.org/tool v1.27.2 // indirect\r\n';
  assert.equal(syncGoModContent(original, '1.27.3'), original.replace('go\t1.27.2', 'go\t1.27.3').replace('go1.27.2', 'go1.27.3'));
  assert.equal(syncGoModContent('go 1.27.2\ntoolchain default\n', '1.27.3'), 'go 1.27.3\ntoolchain default\n');
});

test('rejects missing or duplicate directives and invalid env versions', () => {
  for (const content of ['', '// go 1.27.2\n', 'go 1.27.2\ngo 1.27.3\n']) {
    assert.throws(() => syncGoModContent(content, '1.27.3'), /exactly one go directive/);
  }
  for (const version of [undefined, '', '1.27', '1.27.3rc1', '"1.27.3"', '1.27.3 # comment', '1.27.3\n', '1.027.3']) {
    assert.throws(() => syncGoModContent('go 1.27.2\n', version), /invalid GO_VERSION/);
  }
  for (const tail of ['toolchain go1.27.2\ntoolchain go1.27.3', 'toolchain custom']) {
    assert.throws(() => syncGoModContent(`go 1.27.2\n${tail}\n`, '1.27.3'), /toolchain directive/);
  }
});

test('preserves slash-heavy comments and ignores long malformed version tokens', () => {
  const comment = `//${'/'.repeat(20_000)} comment`;
  const original = `go 1.27.2 ${comment}\r\ntoolchain go1.27.2 ${comment}\r\n`;
  assert.equal(syncGoModContent(original, '1.27.3'), original.replaceAll('1.27.2', '1.27.3'));

  const token = '1'.repeat(20_000);
  const malformed = `go ${token} invalid\ntoolchain go${token} invalid\n`;
  assert.equal(syncGoModContent(`${malformed}go 1.27.2\n`, '1.27.3'), `${malformed}go 1.27.3\n`);
});

function fixture(t) {
  const repoDirectory = temporaryDirectory(t, 'sync-go-mod-versions-');
  const envPath = path.join(repoDirectory, '.env');
  writeFileSync(envPath, '#GO_VERSION: 1.27.2\nGO_VERSION: 1.27.3\n');
  const originals = new Map();
  for (const module of goModules) {
    const file = path.join(repoDirectory, module, 'go.mod');
    mkdirSync(path.dirname(file), { recursive: true });
    const content = 'module example\n\ngo 1.27.2\n\nrequire example.org/lib v1.27.2\n';
    writeFileSync(file, content);
    writeFileSync(path.join(path.dirname(file), 'go.sum'), 'checksum lock\n');
    originals.set(file, content);
  }
  return { repoDirectory, envPath, originals };
}

test('1.27.2 to 1.27.3 propagates to every module; check mode never writes', (t) => {
  const options = fixture(t);
  assert.throws(() => syncGoModVersions({ ...options, check: true }), /out of date/);
  for (const [file, original] of options.originals) assert.equal(readFileSync(file, 'utf8'), original);
  assert.equal(syncGoModVersions(options).filter(({ changed }) => changed).length, 3);
  for (const [file, original] of options.originals) {
    assert.equal(readFileSync(file, 'utf8'), original.replace('go 1.27.2', 'go 1.27.3'));
    assert.equal(readFileSync(path.join(path.dirname(file), 'go.sum'), 'utf8'), 'checksum lock\n');
  }
  assert.ok(syncGoModVersions({ ...options, check: true }).every(({ changed }) => !changed));
  assert.ok(syncGoModVersions(options).every(({ changed }) => !changed));
});

test('invalid env, malformed or missing final module prevents any batch writes', (t) => {
  const options = fixture(t);
  writeFileSync(options.envPath, 'OTHER_VERSION: 1.27.3\n');
  assert.throws(() => syncGoModVersions(options), /invalid GO_VERSION/);
  writeFileSync(options.envPath, 'GO_VERSION: 1.27.3\n');
  const last = path.join(options.repoDirectory, '.github/go-tools/go.mod');
  writeFileSync(last, 'module tools\n');
  assert.throws(() => syncGoModVersions(options), /go-tools.*go.mod:.*go directive/);
  rmSync(last);
  assert.throws(() => syncGoModVersions(options), /go-tools.*go.mod:/);
  for (const [file, original] of options.originals) {
    if (file !== last) assert.equal(readFileSync(file, 'utf8'), original);
  }
});
