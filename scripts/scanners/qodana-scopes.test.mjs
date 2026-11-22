import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { temporaryDirectory } from '../test-helpers.mjs';
import { scopesForEvent, selectScopes } from './qodana-scopes.mjs';

const both = { 'services-java': true, orchestrator: true };
const none = { 'services-java': false, orchestrator: false };
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const pr = { pull_request: { base: { sha: base }, head: { sha: head } } };

test('source, Maven and configuration changes select their scope; documentation does not', () => {
  for (const path of ['services/java/quarkus/jvm/src/Main.java', 'services/java/checkstyle.xml', 'services/java/quarkus/native/pom.xml']) {
    assert.deepEqual(selectScopes([path]), { ...none, 'services-java': true });
  }
  assert.deepEqual(selectScopes(['utils/orchestrator/pom.xml']), { ...none, orchestrator: true });
  assert.deepEqual(selectScopes(['utils/nextjs-dash/app/page.tsx', 'services/java/README.md', 'utils/orchestrator/README.template.md']), none);
  assert.deepEqual(selectScopes(['services/java/a.java', 'utils/orchestrator/a.java']), both);
});

test('shared scanner changes invalidate both scopes; reviewed baselines select only their scope', () => {
  for (const path of ['qodana.yaml', '.qodana/baseline/qodana-settings.xml', '.github/workflows/qodana_code_quality.yml', '.github/qodana-cli-lock.json', 'scripts/scanners/qodana-scopes.test.mjs', 'scripts/ci/github-release-asset.mjs', '.github/actions/upload-artifact/action.yml']) {
    assert.deepEqual(selectScopes([path]), both, path);
  }
  for (const path of ['.idea/misc.xml', 'scripts/scanners/qodana-project.mjs', 'scripts/ci/changed-paths.mjs']) assert.deepEqual(selectScopes([path]), both);
  assert.deepEqual(selectScopes(['services/java/quarkus/native/mvnw']), { ...none, 'services-java': true });
  for (const name of Object.keys(both)) assert.deepEqual(selectScopes([`.qodana/baseline/${name}.sarif.json`]), { ...none, [name]: true });
});

test('unknown events, malformed SHAs and failed diffs conservatively scan both', () => {
  for (const eventName of ['push', 'workflow_dispatch', 'schedule']) {
    assert.deepEqual(scopesForEvent(eventName, {}, () => assert.fail('no diff needed')), both);
  }
  for (const sha of ['--help', `${head}\n`, undefined]) {
    assert.deepEqual(scopesForEvent('pull_request', { pull_request: { base: { sha }, head: { sha: head } } }, () => assert.fail('invalid SHA reached git')), both);
  }
  for (const result of [{ status: 1 }, { error: new Error('timeout') }]) assert.deepEqual(scopesForEvent('pull_request', pr, () => result), both);
});

test('PRs use merge-base diffs and merge queues use two endpoints, with bounded argument-vector execution', () => {
  for (const eventName of ['pull_request', 'merge_group']) {
    const event = eventName === 'pull_request' ? pr : { merge_group: { base_sha: base, head_sha: head } };
    const result = scopesForEvent(eventName, event, (command, args, options) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', ...(eventName === 'pull_request' ? [`${base}...${head}`] : [base, head]), '--']);
      assert.equal(options.timeout, 30_000);
      assert.equal(options.shell, undefined);
      return { status: 0, stdout: 'services/java/deleted.java\0docs/file with spaces.md\0' };
    });
    assert.deepEqual(result, { ...none, 'services-java': true });
  }
});

test('real git diffs include deleted paths and both sides of cross-scope renames', (t) => {
  const cwd = temporaryDirectory(t, 'qodana-scopes-');
  const git = (...args) => {
    const result = spawnSync('git', ['-c', `safe.directory=${cwd}`, ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(cwd, 'services/java'), { recursive: true });
  writeFileSync(join(cwd, 'services/java/Old.java'), 'class Old {}');
  git('add', '.');
  git('commit', '-m', 'base');
  const baseSha = git('rev-parse', 'HEAD');
  mkdirSync(join(cwd, 'utils/orchestrator'), { recursive: true });
  git('mv', 'services/java/Old.java', 'utils/orchestrator/New.java');
  git('commit', '-m', 'move');
  const event = { merge_group: { base_sha: baseSha, head_sha: git('rev-parse', 'HEAD') } };
  assert.deepEqual(scopesForEvent('merge_group', event, (command, args, options) => spawnSync(command, ['-c', `safe.directory=${cwd}`, ...args], { ...options, cwd })), both);
});
