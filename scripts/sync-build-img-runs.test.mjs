import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { temporaryDirectory } from './test-helpers.mjs';
import { syncBuildImageRuns, syncBuildImageXml } from './sync-build-img-runs.mjs';

const readRun = (name) => readFileSync(resolveRepoPath(`.run/[build-img] ${name}.run.xml`), 'utf8');
const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
const newVersions = Object.fromEntries(Object.keys(variables)
  .filter((key) => key.endsWith('_VERSION')).map((key) => [key, '91.3.5']));
newVersions.DJANGO_VERSION = '92.4.6';
newVersions.PYTHON_VERSION = '93.5.7';

test('Micronaut updates the tag, version argument and build name while preserving Docker settings', () => {
  const original = readRun('Micronaut JVM');
  const actual = syncBuildImageXml(original, newVersions);
  assert.ok(actual.includes('value="micronaut-jvm:91.3.5_latest"'));
  assert.match(actual, /name="name" value="MICRONAUT_VERSION"\s*\/>\s*<option name="value" value="91\.3\.5"/);
  const withoutNotice = (xml) => xml.replace(/^.*<!-- Versions:.*-->\r?\n/m, '');
  assert.equal(withoutNotice(actual), withoutNotice(original).replaceAll(variables.MICRONAUT_VERSION, '91.3.5'));
  assert.equal(syncBuildImageXml(actual, newVersions), actual);
});

test('Django image tags and build names use Django while build arguments use Python', () => {
  for (const name of ['Platform', 'Reactive']) {
    const actual = syncBuildImageXml(readRun(`Django ${name}`), newVersions);
    const image = `django-${name.toLowerCase()}:92.4.6_latest`;
    assert.equal(actual.split(`value="${image}"`).length - 1, 2);
    assert.match(actual, /name="name" value="PYTHON_VERSION"\s*\/>\s*<option name="value" value="93\.5\.7"/);
  }
});

test('shared build names and Spring profile and virtual-thread arguments are preserved', () => {
  const spark = syncBuildImageXml(readRun('Spark JVM Virtual'), newVersions);
  assert.ok(spark.includes('value="spark-jvm-virtual:91.3.5_latest"'));
  assert.ok(spark.includes('value="spark-jvm:91.3.5_latest"'));
  const spring = syncBuildImageXml(readRun('Spring NATIVE Tomcat Virtual'), newVersions);
  assert.match(spring, /name="name" value="PROFILE"\s*\/>\s*<option name="value" value="tomcat"/);
  assert.match(spring, /name="name" value="VIRTUAL_ENABLED"\s*\/>\s*<option name="value" value="true"/);
});

test('every versioned build configuration can be updated from env values', () => {
  const files = readdirSync(resolveRepoPath('.run')).filter((file) => file.startsWith('[build-img]') && file.endsWith('.run.xml'));
  let versionedCount = 0;
  for (const file of files) {
    const original = readFileSync(resolveRepoPath(`.run/${file}`), 'utf8');
    const actual = syncBuildImageXml(original, newVersions);
    if (!original.includes('_VERSION')) {
      assert.equal(actual, original, file);
      continue;
    }
    versionedCount += 1;
    const imageVersion = file.includes('Django') ? '92.4.6' : '91.3.5';
    assert.match(actual, new RegExp(`name="imageTag" value="[^"\\n]+:${imageVersion.replaceAll('.', '\\.')}_latest"`), file);
    for (const [, key] of original.matchAll(/name="name" value="([A-Z_]+_VERSION)"/g)) {
      assert.ok(actual.includes(`<option name="value" value="${newVersions[key]}" />`), `${file}: ${key}`);
    }
    assert.equal(syncBuildImageXml(actual, newVersions), actual, file);
  }
  assert.ok(versionedCount >= 26);
});

test('utility builds and cache pruning are unchanged without any version values', () => {
  for (const name of ['Next.js Dashboard', 'Orchestrator', 'Wrk2', '~_PRUNE_ Docker Cache']) {
    const xml = readRun(name);
    assert.equal(syncBuildImageXml(xml, {}), xml);
  }
});

test('missing and invalid versions fail, and ambiguous image versions require an explicit mapping', () => {
  const xml = readRun('Micronaut JVM');
  for (const value of [undefined, '', '5.0 # comment', '5.0" />', '5'.repeat(130)]) {
    assert.throws(() => syncBuildImageXml(xml, { MICRONAUT_VERSION: value }), /Missing or invalid version MICRONAUT_VERSION/);
  }
  assert.throws(() => syncBuildImageXml(readRun('Django Platform'), { PYTHON_VERSION: '3.13.1' }), /DJANGO_VERSION/);
  const duplicateVersionArg = xml.replace('value="BUILDKIT_BUILD_NAME"', 'value="OTHER_VERSION"');
  assert.throws(() => syncBuildImageXml(duplicateVersionArg, newVersions), /Ambiguous image version/);
  const missingTag = xml.replace('name="imageTag"', 'name="unexpectedTag"');
  assert.throws(() => syncBuildImageXml(missingTag, newVersions), /exactly one imageTag option/);
});

function fixture(t) {
  const directory = temporaryDirectory(t, 'sync-build-img-runs-');
  const envPath = path.join(directory, '.env');
  writeFileSync(envPath, '#MICRONAUT_VERSION: 0.0.0\r\nMICRONAUT_VERSION: 91.3.5\r\n');
  return { directory, envPath };
}

test('check detects drift without writes; generation is scoped, repeatable and skips unchanged files', (t) => {
  const { directory, envPath } = fixture(t);
  const file = path.join(directory, '[build-img] Micronaut JVM.run.xml');
  const excluded = path.join(directory, '[run] Micronaut JVM.run.xml');
  const original = readRun('Micronaut JVM').replace(/\r?\n/g, '\r\n');
  writeFileSync(file, original);
  writeFileSync(excluded, original);
  assert.throws(() => syncBuildImageRuns({ envPath, runDirectory: directory, check: true }), /out of date/);
  assert.equal(readFileSync(file, 'utf8'), original);
  const results = syncBuildImageRuns({ envPath, runDirectory: directory });
  assert.equal(results.length, 1);
  assert.equal(results[0].changed, true);
  assert.equal(readFileSync(excluded, 'utf8'), original);
  assert.match(readFileSync(file, 'utf8'), /\r\n {2}<!-- Versions:/);
  assert.equal(syncBuildImageRuns({ envPath, runDirectory: directory, check: true })[0].changed, false);
  assert.equal(syncBuildImageRuns({ envPath, runDirectory: directory })[0].changed, false);
});

test('a missing version prevents writes to every configuration in the batch', (t) => {
  const { directory, envPath } = fixture(t);
  const firstPath = path.join(directory, '[build-img] A.run.xml');
  const original = readRun('Micronaut JVM');
  writeFileSync(firstPath, original);
  writeFileSync(path.join(directory, '[build-img] B.run.xml'), readRun('Quarkus JVM'));
  assert.throws(() => syncBuildImageRuns({ envPath, runDirectory: directory }), /B\.run\.xml:.*QUARKUS_VERSION/);
  assert.equal(readFileSync(firstPath, 'utf8'), original);
});
