import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadManifestTemplatePaths, resolveRepoPath } from '../readmes/render-readmes.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';
import {
  assertPmdLockCurrent, formatPmdLock, pmdLock, pmdPom, pmdReleaseUrl, pmdTemplateVariables, pmdVersionKey,
  readPmdLock, readPmdVersion, resolvePmdDigest, syncPmdLock, validatePmdChange,
} from './sync-pmd-version.mjs';

const sha = 'a'.repeat(64);
const pomFixture = (version = '7.29.0') => '<project>\r\n  <properties>\r\n    <maven-pmd-plugin.version>3.28.0</maven-pmd-plugin.version>\r\n'
  + `    <pmd.version>${version}</pmd.version>\r\n  </properties>\r\n</project>\r\n`;
const release = (version, digest = `sha256:${sha}`, extra = []) => ({
  tag_name: `pmd_releases/${version}`,
  assets: [{ name: `pmd-dist-${version}-bin.zip.asc`, digest: `sha256:${'b'.repeat(64)}` },
    { name: `pmd-dist-${version}-bin.zip`, digest }, ...extra],
});
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('PMD version is read only from one stable orchestrator POM property', () => {
  assert.equal(readPmdVersion(pomFixture()), '7.29.0');
  for (const invalid of [pomFixture('7.30.0-rc1'), pomFixture('${pmd}'), pomFixture(' 7.29.0'), pomFixture('7.29'), '<project/>',
    `${pomFixture()}<pmd.version>7.29.0</pmd.version>`]) {
    assert.throws(() => readPmdVersion(invalid), /Expected (?:one <pmd\.version>|a stable X\.Y\.Z)/);
  }
  const load = (keys) => pmdTemplateVariables(new Set(keys), (file) => {
    assert.equal(file, pmdPom);
    return pomFixture('7.31.2');
  });
  assert.deepEqual(load(['GO_VERSION']), {});
  assert.deepEqual(load([pmdVersionKey]), { PMD_VERSION: '7.31.2' });
});

test('PMD change validation accepts only the version property', () => {
  const base = pomFixture();
  assert.equal(validatePmdChange(base, base), false);
  assert.equal(validatePmdChange(base, pomFixture('7.30.0')), true);
  for (const head of [pomFixture('7.30.0').replace('3.28.0', '3.29.0'), `${pomFixture('7.30.0')}<!-- extra -->`]) {
    assert.throws(() => validatePmdChange(base, head), /only the <pmd\.version> property/);
  }
  assert.throws(() => validatePmdChange(base, pomFixture('8.0.0-SNAPSHOT')), /stable X\.Y\.Z/);
});

test('PMD lock has a strict, version-bound shape', () => {
  const lock = formatPmdLock('7.29.0', sha);
  assert.deepEqual(readPmdLock(lock), { version: '7.29.0', assetName: 'pmd-dist-7.29.0-bin.zip', sha256: sha });
  assert.ok(lock.endsWith('}\n'));
  for (const [content, error] of [
    ['{', /Invalid JSON/],
    ['[]', /exactly version, assetName and sha256/],
    [JSON.stringify({ version: '7.29.0', sha256: sha }), /exactly version/],
    [JSON.stringify({ ...JSON.parse(lock), url: 'https://example.test' }), /exactly version/],
    [JSON.stringify({ ...JSON.parse(lock), assetName: 'pmd-dist-7.28.0-bin.zip' }), /assetName must match/],
    [JSON.stringify({ ...JSON.parse(lock), sha256: sha.toUpperCase() }), /lowercase SHA-256/],
    [JSON.stringify({ ...JSON.parse(lock), version: '7.29.0\n' }), /stable X\.Y\.Z/],
  ]) assert.throws(() => readPmdLock(content), error);
  assert.throws(() => formatPmdLock('7.29.0', 'short'), /lowercase PMD archive SHA-256/);
  assert.throws(() => assertPmdLockCurrent(pomFixture('7.30.0'), lock), /pins PMD 7\.29\.0 but .* uses 7\.30\.0\. Run node scripts\/versions\/sync-pmd-version\.mjs/);
});

test('the repository PMD lock, POM, workflow and docs agree', () => {
  const pom = readFileSync(resolveRepoPath(pmdPom), 'utf8');
  const { version } = assertPmdLockCurrent(pom, readFileSync(resolveRepoPath(pmdLock), 'utf8'));
  const workflow = readFileSync(resolveRepoPath('.github/workflows/pmd.yml'), 'utf8').replaceAll('\r\n', '\n');
  assert.ok(!workflow.includes(version), 'The PMD workflow must read its version from the lock');
  assert.doesNotMatch(workflow, /PMD_SHA256: '[a-f0-9]{64}'/);
  assert.match(workflow, /- '\.github\/pmd-lock\.json'\n[\s\S]*pull_request:[\s\S]*- '\.github\/pmd-lock\.json'\n/);
  assert.match(workflow, /id: pmd_pin\n[\s\S]*?jq -er '\.version' \.github\/pmd-lock\.json[\s\S]*?<pmd\.version>\$\{version}<\/pmd\.version>/);
  assert.match(workflow, /PMD_VERSION: \$\{\{ steps\.pmd_pin\.outputs\.version }}\n {10}PMD_SHA256: \$\{\{ steps\.pmd_pin\.outputs\.sha256 }}/);
  assert.match(workflow, /key: pmd-[^\n]*steps\.pmd_pin\.outputs\.version }}-\$\{\{ steps\.pmd_pin\.outputs\.sha256 }}/);
  for (const template of loadManifestTemplatePaths('scripts/readmes/render-readmes.manifest.json')) {
    assert.doesNotMatch(readFileSync(resolveRepoPath(template), 'utf8'), /PMD \d+\.\d+\.\d+/, template);
  }
  for (const template of ['README.template.md', 'docs/LINTING_AND_CODE_QUALITY.template.md']) {
    assert.ok(readFileSync(resolveRepoPath(template), 'utf8').includes('PMD {{PMD_VERSION}}'), template);
  }
});

test('PMD digest lookup is a fixed anonymous GitHub request for the validated release tag', async (t) => {
  const fetchImpl = t.mock.fn(async () => respond(release('7.30.1')));
  assert.equal(await resolvePmdDigest('7.30.1', fetchImpl), sha);
  assert.equal(fetchImpl.mock.callCount(), 1);
  const [url, options] = fetchImpl.mock.calls[0].arguments;
  assert.equal(url, 'https://api.github.com/repos/pmd/pmd/releases/tags/pmd_releases%2F7.30.1');
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.deepEqual(options.headers, { Accept: 'application/vnd.github+json' });
  assert.equal(pmdReleaseUrl('7.30.1').tag, 'pmd_releases/7.30.1');
});

test('malformed PMD versions never reach the network', async (t) => {
  const fetchImpl = t.mock.fn(async () => assert.fail('unexpected request'));
  for (const version of ['', '7.30', '7.30.1-rc1', '../7.30.1', '7.30.1/../../../../repos/x', '%2e%2e/7.30.1', '7.30.1?x=1',
    '7.30.1#x', '7.30.1\n', ' 7.30.1', '7.30.1%2F', 7, null]) {
    await assert.rejects(resolvePmdDigest(version, fetchImpl), /stable X\.Y\.Z/);
  }
  assert.equal(fetchImpl.mock.callCount(), 0);
});

test('untrusted PMD release metadata must identify exactly one digest for the requested asset', async () => {
  for (const body of [
    { ...release('7.30.1'), tag_name: 'pmd_releases/7.30.0' },
    { tag_name: 'pmd_releases/7.30.1' },
    release('7.30.1', null),
    release('7.30.1', `sha1:${'a'.repeat(40)}`),
    release('7.30.1', `sha256:${sha}\n`),
    release('7.30.1', `sha256:${sha}`, [{ name: 'pmd-dist-7.30.1-bin.zip', digest: `sha256:${'c'.repeat(64)}` }]),
  ]) {
    await assert.rejects(resolvePmdDigest('7.30.1', async () => respond(body)), /Unexpected PMD release metadata|Missing, ambiguous or invalid/);
  }
});

test('PMD digest lookup retries only transient failures', async () => {
  const waits = [];
  const options = { wait: async (delay) => waits.push(delay), warn: () => {} };
  const responses = [respond({}, 503), respond({}, 429), respond(release('7.30.1'))];
  assert.equal(await resolvePmdDigest('7.30.1', async () => responses.shift(), options), sha);
  assert.deepEqual(waits, [2000, 4000]);
  let calls = 0;
  await assert.rejects(resolvePmdDigest('7.30.1', async () => { calls += 1; return respond({}, 404); }, options), /HTTP 404/);
  assert.equal(calls, 1);
});

function lockRoot(t, pomVersion, lockVersion = '7.29.0') {
  const root = temporaryDirectory(t, 'pmd-lock-');
  mkdirSync(path.join(root, 'utils/orchestrator'), { recursive: true });
  mkdirSync(path.join(root, '.github'));
  writeFileSync(path.join(root, pmdPom), pomFixture(pomVersion));
  writeFileSync(path.join(root, pmdLock), formatPmdLock(lockVersion, 'e'.repeat(64)));
  return root;
}

test('PMD lock sync is offline when current or checking, and refreshes from upstream otherwise', async (t) => {
  const offline = t.mock.fn(async () => assert.fail('unexpected request'));
  const current = lockRoot(t, '7.29.0');
  assert.equal((await syncPmdLock({ root: current, fetchImpl: offline })).changed, false);
  assert.equal((await syncPmdLock({ root: current, check: true, fetchImpl: offline })).changed, false);

  const stale = lockRoot(t, '7.30.1');
  const before = readFileSync(path.join(stale, pmdLock), 'utf8');
  await assert.rejects(syncPmdLock({ root: stale, check: true, fetchImpl: offline }), /pins PMD 7\.29\.0/);
  assert.equal(readFileSync(path.join(stale, pmdLock), 'utf8'), before);
  assert.equal(offline.mock.callCount(), 0);

  const result = await syncPmdLock({ root: stale, fetchImpl: async () => respond(release('7.30.1')) });
  assert.equal(result.changed, true);
  assert.equal(readFileSync(path.join(stale, pmdLock), 'utf8'), formatPmdLock('7.30.1', sha));

  const failed = lockRoot(t, '7.30.1');
  await assert.rejects(syncPmdLock({ root: failed, fetchImpl: async () => respond(release('7.30.1', 'sha256:bad')) }), /invalid PMD release asset digest/);
  assert.equal(readFileSync(path.join(failed, pmdLock), 'utf8'), before, 'A failed lookup leaves the lock untouched');
});
