import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from '../readmes/render-readmes.mjs';
import { mavenGeneratedPaths, readMavenVersion, syncMavenContent, syncMavenVersions } from './sync-maven-versions.mjs';
import { validateVersionChange } from './renovate-framework-sync.mjs';

test('Maven relay covers every JVM builder and native distribution, preserving unrelated content', () => {
  assert.equal(mavenGeneratedPaths.length, 16);
  const current = readMavenVersion(parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8')));
  for (const file of mavenGeneratedPaths) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    for (const content of [original, original.replace(/\r?\n/g, '\r\n')]) {
      const updated = syncMavenContent(content, file, '3.99.1');
      const expected = content.replaceAll(current, '3.99.1').replace(
        /(ARG IMAGE_BUILDER=maven:[^\r\n@]+)@sha256:[a-f0-9]{64}/, '$1');
      assert.equal(updated, expected, file);
      assert.equal(syncMavenContent(updated, file, '3.99.1'), updated, file);
      assert.equal(syncMavenContent(content, file, current), content, file);
    }
  }
});

test('missing, duplicate and malformed declarations fail closed', () => {
  for (const file of mavenGeneratedPaths) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    assert.throws(() => syncMavenContent('', file, '3.99.1'), /exactly one/);
    assert.throws(() => syncMavenContent(`${original}\n${original}`, file, '3.99.1'), /exactly one/);
  }
  for (const version of [undefined, '', '3.9', '3.9.1-RC1', '3.9.1\n', '${VERSION}', '3.9.1/../../elsewhere']) {
    assert.throws(() => readMavenVersion({ MAVEN_VERSION: version }), /stable/);
  }
});

test('checked-in Maven inputs match the env without writes', () => {
  assert.ok(syncMavenVersions({ check: true }).every(({ changed }) => !changed));
  const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
  assert.deepEqual(validateVersionChange(env, env.replace(/^MAVEN_VERSION:.*$/m, 'MAVEN_VERSION: 3.99.1')), ['MAVEN_VERSION']);
});

test('Renovate suppresses downstream Maven tag/distribution updates and retains digest and wrapper updates', () => {
  const { packageRules } = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
  const wrappers = packageRules.find(({ matchManagers }) => matchManagers?.includes('maven-wrapper'));
  assert.equal(wrappers.enabled, false);
  assert.deepEqual(wrappers.matchPackageNames, ['org.apache.maven:apache-maven']);
  const builder = packageRules.find(({ matchPackageNames }) => matchPackageNames?.includes('maven'));
  assert.equal(builder.enabled, false);
  assert.ok(!builder.matchUpdateTypes.includes('digest'));
  assert.ok(!builder.matchUpdateTypes.includes('pinDigest'));
});
