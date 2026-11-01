import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { api, assertRenovatePullRequest, buildGitHubRequest, selectGeneratedUpdates, validateFrameworkTree, validateVersionChange } from './renovate-framework-sync.mjs';
import { frameworkVersionKeys } from './sync-framework-versions.mjs';

const config = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
const managers = config.customManagers.filter((manager) => manager.managerFilePatterns.includes('/^compose\\/\\.env$/'));

test('Renovate extracts each active env pin once with the correct registry coordinates', () => {
  const expected = {
    SPRING_BOOT_VERSION: ['maven', 'org.springframework.boot:spring-boot-dependencies'],
    QUARKUS_VERSION: ['maven', 'io.quarkus.platform:quarkus-bom'],
    MICRONAUT_VERSION: ['maven', 'io.micronaut:micronaut-core-bom'],
    HELIDON_VERSION: ['maven', 'io.helidon:helidon-bom'],
    SPARK_VERSION: ['maven', 'org.zoomba-lang:spark-core'],
    JAVALIN_VERSION: ['maven', 'io.javalin:javalin'],
    DROPWIZARD_VERSION: ['maven', 'io.dropwizard:dropwizard-dependencies'],
    VERTX_VERSION: ['maven', 'io.vertx:vertx-stack-depchain'],
    PEKKO_VERSION: ['maven', 'org.apache.pekko:pekko-http_3'],
    GO_VERSION: ['golang-version', 'go'],
    PYTHON_VERSION: ['github-tags', 'python/cpython'],
    DJANGO_VERSION: ['pypi', 'django'],
  };
  assert.equal(managers.length, 12);
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
  assert.ok(!maven.matchPackageNames.some((pattern) => pattern.includes('pekko-stream') || pattern.includes('pekko-slf4j') || pattern.includes('micronaut-micrometer')));
  const go = rules.find(({ matchManagers }) => matchManagers.includes('gomod'));
  assert.deepEqual(go.matchDepTypes, ['golang']);
  const docker = rules.find(({ matchManagers }) => matchManagers.includes('dockerfile'));
  assert.ok(!docker.matchUpdateTypes.includes('digest') && !docker.matchUpdateTypes.includes('pinDigest'));
  const source = config.packageRules.find(({ matchFileNames }) => matchFileNames?.includes('compose/.env'));
  assert.equal(source.rebaseWhen, 'behind-base-branch');
  assert.deepEqual(config.gitIgnoredAuthors, ['41898282+github-actions[bot]@users.noreply.github.com']);
  assert.ok(config.packageRules.some(({ matchUpdateTypes, dependencyDashboardApproval }) => matchUpdateTypes?.includes('major') && dependencyDashboardApproval));
  assert.equal(config.automerge, false);
  assert.equal(config.vulnerabilityAlerts.minimumReleaseAge, '0 days');
});

test('only active version values may change, preserving local settings and comments', () => {
  const updated = env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, '$1 9.0.1');
  assert.deepEqual(validateVersionChange(env, updated), ['QUARKUS_VERSION']);
  assert.deepEqual(validateVersionChange(env, env), []);
  assert.throws(() => validateVersionChange(env, `${updated}\nORCH_API_KEY: another\n`), /only active/);
  assert.throws(() => validateVersionChange(env, updated.replace('HOST_REPO:', 'OTHER_REPO:')), /only active/);
  assert.throws(() => validateVersionChange(env, `${env}\nQUARKUS_VERSION: 9.0.1\n`), /one literal/);
  assert.throws(() => validateVersionChange(env, env.replace(/(^QUARKUS_VERSION:)[^\r\n]+/m, '$1 $(echo hacked)')), /one literal/);
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

test('generated updates are idempotent and never overwrite unrelated branch edits', () => {
  const files = [{ file: 'pom.xml', content: 'new' }];
  const base = new Map([['pom.xml', 'old']]);
  assert.deepEqual(selectGeneratedUpdates(files, base, base), files);
  assert.deepEqual(selectGeneratedUpdates(files, base, new Map([['pom.xml', 'new']])), []);
  assert.throws(() => selectGeneratedUpdates(files, base, new Map([['pom.xml', 'custom']])), /overwrite a PR edit/);
});

test('Sonar version publication refuses unrelated PR edits to scanner scope or encoding', () => {
  const file = '.sonarcloud.properties';
  const original = 'sonar.python.version=3.13\nsonar.sourceEncoding=UTF-8\n';
  const content = original.replace('3.13', '3.14');
  const base = new Map([[file, original]]);
  const files = [{ file, content }];
  assert.deepEqual(selectGeneratedUpdates(files, base, base), files);
  assert.deepEqual(selectGeneratedUpdates(files, base, new Map([[file, content]])), []);
  for (const edited of [`${original}sonar.exclusions=**\n`, original.replace('UTF-8', 'ISO-8859-1')]) {
    assert.throws(() => selectGeneratedUpdates(files, base, new Map([[file, edited]])), /overwrite a PR edit/);
  }
});

test('workflow executes only trusted base scripts, keeps credentials scoped, and does not force refs', () => {
  const workflow = readFileSync(resolveRepoPath('.github/workflows/renovate_framework_sync.yml'), 'utf8');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.base.sha }}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github.event.pull_request.head/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /^\s+contents: write/m);
  assert.match(workflow, /RENOVATE_SYNC_TOKEN: \$\{\{ secrets.RENOVATE_SYNC_TOKEN }}/);
  const helper = readFileSync(resolveRepoPath('scripts/renovate-framework-sync.mjs'), 'utf8');
  assert.match(helper, /force: false/);
  assert.ok(helper.includes('parents: [state.headSha]'));
  assert.ok(helper.includes(config.gitIgnoredAuthors[0]));
});
