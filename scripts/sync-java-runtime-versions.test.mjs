import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { validateVersionChange } from './renovate-framework-sync.mjs';
import { frameworkVersionKeys } from './sync-framework-versions.mjs';
import { javaRuntimeGeneratedPaths, javaRuntimeVersionKeys, readJavaRuntimeVersion, syncJavaRuntimeContent } from './sync-java-runtime-versions.mjs';

test('Java pins require an integer major and two to four numeric suffix components without a leading dot', () => {
  assert.deepEqual(readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.4' }),
    { major: '25', minorPatch: '0.4', full: '25.0.4' });
  for (const minorPatch of ['0.5', '0.5.0', '0.5.0.3', '12.34.56.789']) {
    assert.equal(readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: minorPatch }).full, `25.${minorPatch}`);
  }
  for (const minorPatch of ['0', '0.5.0.3.1', '0..5', '0.5.', '-0.5', '0.5.0.x', '0.5.0.3\r', '0.5.0.3\n']) {
    assert.throws(() => readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: minorPatch }), /two to four/);
  }
  for (const key of javaRuntimeVersionKeys) {
    for (const invalid of [undefined, '', '0.4-ea', '.0.4', '25\r', '25\n', '0.4\r', '0.4\n', '${VERSION}', '25;echo']) {
      assert.throws(() => readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.4', [key]: invalid }), /must (?:be|contain)/);
    }
  }
});

test('runtime inventory is synchronized, changes both release components, preserves CRLF and is repeatable', () => {
  const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
  const current = readJavaRuntimeVersion(variables);
  const next = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '26', JAVA_MINOR_PATCH_VERSION: '1.2' });
  for (const file of javaRuntimeGeneratedPaths) {
    const content = readFileSync(resolveRepoPath(file), 'utf8');
    assert.equal(syncJavaRuntimeContent(content, file, current), content, file);
    const updated = syncJavaRuntimeContent(content, file, next);
    assert.notEqual(updated, content, file);
    assert.equal(syncJavaRuntimeContent(updated, file, next), updated, file);
    const crlf = content.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
    assert.equal(syncJavaRuntimeContent(crlf, file, next), updated.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'), file);
  }
});

test('changing an image Java tag drops its stale digest; patch updates retain the existing digest', () => {
  const content = readFileSync(resolveRepoPath('utils/orchestrator/Dockerfile'), 'utf8');
  const patch = syncJavaRuntimeContent(content, 'utils/orchestrator/Dockerfile', { major: '25', minorPatch: '0.5', full: '25.0.5' });
  assert.match(patch, /eclipse-temurin-25-noble@sha256:[a-f0-9]+/);
  const major = syncJavaRuntimeContent(content, 'utils/orchestrator/Dockerfile', { major: '26', minorPatch: '0.1', full: '26.0.1' });
  assert.match(major, /eclipse-temurin-26-noble\r?\n/);
  assert.doesNotMatch(major, /eclipse-temurin-26-noble@sha256/);
});

test('Renovate never extracts or authorizes edits to the manually managed Java env pins', () => {
  const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
  const config = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
  const javaImages = config.packageRules.find(({ description }) => description.startsWith('Java/GraalVM versions'));
  assert.equal(javaImages.enabled, false);
  assert.ok(!javaImages.matchUpdateTypes.includes('digest'));
  assert.ok(!javaImages.matchPackageNames.includes('maven'), 'Maven tooling remains independently managed');
  assert.ok(config.packageRules.some(({ matchPackageNames, enabled }) => enabled === false
    && matchPackageNames?.includes('org.graalvm.nativeimage:svm')));
  for (const key of javaRuntimeVersionKeys) {
    assert.ok(!frameworkVersionKeys.includes(key));
    const line = `${key}: 99.1\n`;
    for (const manager of config.customManagers) {
      for (const pattern of manager.matchStrings) assert.equal(new RegExp(pattern).test(line), false);
    }
    assert.throws(() => validateVersionChange(env, env.replace(new RegExp(`^${key}:.*$`, 'm'), line.trim())), /only active/);
  }
});

test('extended suffixes propagate completely and can return to two components without leftovers', () => {
  const current = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.5' });
  const extended = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.5.0.3' });
  for (const [file, original] of [
    ['services/java/quarkus/native/Dockerfile', 'ARG JAVA_RELEASE=25\nARG JAVA_MINOR_RELEASE=.0.5\n'],
    ['services/java/helidon/mp/native/pom.xml', '<properties><maven.compiler.release>25</maven.compiler.release><graalvm.version>25.0.5</graalvm.version></properties>'],
  ]) {
    const updated = syncJavaRuntimeContent(original, file, extended);
    assert.ok(updated.includes(file.endsWith('/pom.xml') ? '>25.0.5.0.3<' : '=.0.5.0.3\n'), file);
    assert.equal(syncJavaRuntimeContent(updated, file, extended), updated, file);
    assert.equal(syncJavaRuntimeContent(updated, file, current), original, file);
  }
});

test('Corretto alternatives use only the Java major, preserve suffixes and follow later major upgrades', () => {
  const current = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.5.0.3' });
  const patch = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '25', JAVA_MINOR_PATCH_VERSION: '0.6' });
  const next = readJavaRuntimeVersion({ JAVA_MAJOR_VERSION: '26', JAVA_MINOR_PATCH_VERSION: '0.1' });
  const file = 'utils/orchestrator/Dockerfile';
  for (const tag of ['25', '25.0.5', '25.0.5.0', '25.0.5.0.3']) {
    for (const suffix of ['', '-al2023-headless', '-alpine']) {
      for (const newline of ['\n', '\r\n']) {
        const original = `ARG JAVA_RELEASE=25${newline}#ARG IMAGE_RUNTIME=amazoncorretto:${tag}${suffix}${newline}`;
        const expected = `ARG JAVA_RELEASE=25${newline}#ARG IMAGE_RUNTIME=amazoncorretto:25${suffix}${newline}`;
        const updated = syncJavaRuntimeContent(original, file, current);
        assert.equal(updated, expected);
        assert.equal(syncJavaRuntimeContent(updated, file, current), expected);
        assert.equal(syncJavaRuntimeContent(updated, file, patch), expected);
        assert.equal(syncJavaRuntimeContent(updated, file, next),
          `ARG JAVA_RELEASE=26${newline}#ARG IMAGE_RUNTIME=amazoncorretto:26${suffix}${newline}`);
      }
    }
  }
});
