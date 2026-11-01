import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { assertRenovatePullRequest, selectGeneratedUpdates, validateFrameworkTree, validateVersionChange } from './renovate-framework-sync.mjs';
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
