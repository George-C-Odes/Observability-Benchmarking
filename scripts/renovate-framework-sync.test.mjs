import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { api, assertRenovatePullRequest, buildGitHubRequest, gitBlobSha, publish, selectGeneratedUpdates, validateFrameworkTree, validateVersionChange } from './renovate-framework-sync.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths } from './sync-framework-versions.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

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
  assert.ok(maven.matchPackageNames.includes('io.quarkus:quarkus-extension-processor'));
  for (const variant of ['jvm', 'native']) {
    const pom = readFileSync(resolveRepoPath(`services/java/quarkus/${variant}/pom.xml`), 'utf8');
    assert.match(pom, /<groupId>io\.quarkus<\/groupId>\s*<artifactId>quarkus-extension-processor<\/artifactId>\s*<version>\$\{quarkus.platform.version}<\/version>/);
  }
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

function publicationFixture(t, onWrite = (route) => assert.fail(`Unexpected request: ${route}`)) {
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
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.base.sha }}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github.event.pull_request.head/);
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
  const helper = readFileSync(resolveRepoPath('scripts/renovate-framework-sync.mjs'), 'utf8');
  assert.match(helper, /force: false/);
  assert.ok(helper.includes('parents: [state.headSha]'));
  assert.ok(helper.includes(config.gitIgnoredAuthors[0]));
});
