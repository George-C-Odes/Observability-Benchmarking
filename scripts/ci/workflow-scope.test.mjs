import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { matchesGlob, pushPatterns, shouldRun } from './workflow-scope.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';

const workflows = ['java_coverage', 'go_coverage', 'go_quality', 'django_python_coverage', 'django_python_quality', 'nextjs_dash_quality', 'pmd'];
const source = (name) => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('routing reads existing positive push globs and fails closed on unsupported configuration', () => {
  for (const name of workflows) {
    const workflow = source(name);
    const patterns = pushPatterns(workflow);
    if (workflow.includes('  workflow_call:')) {
      assert.equal(patterns, null, name);
      assert.equal(shouldRun('merge_group', ['docs/readme.md'], workflow), true, 'Sonar requires full coverage even for unrelated groups');
      continue;
    }
    assert.ok(patterns?.length > 0, name);
    assert.equal(shouldRun('merge_group', ['docs/readme.md'], workflow), false, name);
    assert.equal(shouldRun('merge_group', [`.github/workflows/${name}.yml`], workflow), true, name);
    assert.equal(shouldRun('merge_group', ['scripts/ci/changed-paths.mjs'], workflow), true, name);
    assert.equal(shouldRun('merge_group', ['scripts/ci/workflow-scope.mjs'], "\n  push:\n    paths:\n      - 'docs/**'\n"), true, name);
    for (const event of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) assert.equal(shouldRun(event, [], workflow), true);
    assert.equal(shouldRun('merge_group', null, workflow), true);
  }
  for (const text of ['', '  push:\n    paths:\n      - "**"', "  push:\n    paths:\n      - '!docs/**'", "  push:\n    paths:\n      - '[abc]/**'"]) {
    assert.equal(pushPatterns(text), null);
    assert.equal(shouldRun('merge_group', [], text), true);
  }
});

test('glob semantics distinguish direct children, nested paths, dots, deletions and both rename paths', () => {
  for (const path of ['utils/orchestrator/Main.java', 'utils/orchestrator/src/Main.java']) assert.equal(matchesGlob(path, 'utils/orchestrator/**/*.java'), true);
  assert.equal(matchesGlob('scripts/scanners/run-qodana-python.py', 'scripts/*qodana*'), false);
  assert.equal(matchesGlob('scripts/scanners/run-qodana-python.py', 'scripts/**/*qodana*'), true);
  assert.equal(matchesGlob('scripts/ci/qodana-cli-asset.mjs', 'scripts/**/*qodana*'), true);
  assert.equal(matchesGlob('services/go/enhanced/go.mod', 'services/go/**'), true);
  assert.equal(matchesGlob('anythingxjava', '*.java'), false);
  assert.equal(shouldRun('merge_group', ['services/go/deleted.go'], source('go_quality')), true);
  assert.equal(shouldRun('merge_group', ['services/go/old.go', 'docs/new.md'], source('go_coverage')), true);
  assert.equal(shouldRun('merge_group', ['services/go/main.go'], source('java_coverage')), true);
  assert.equal(shouldRun('merge_group', ['services/java/example/Main.java'], source('go_quality')), false);
});

test('every expensive step is scoped while existing job identities and failure evidence remain', () => {
  for (const name of workflows) {
    const workflow = source(name);
    const jobs = workflow.split(/\n(?= {2}[a-z-]+:\n)/);
    for (const job of jobs.filter((job) => job.includes('id: scope'))) {
      assert.ok(job.includes(`workflow: ${name}.yml`));
      assert.match(job, /fetch-depth: \$\{\{ github.event_name == 'merge_group' && '0' \|\| '1' }}/);
      const tail = job.slice(job.indexOf('      - name: Select merge group scope'));
      const steps = tail.split('\n      - name: ').slice(1);
      assert.ok(steps.length > 0);
      for (const step of steps) assert.match(step, /if: .*steps.scope.outputs.run == 'true'/, `${name}: ${step.split('\n')[0]}`);
    }
  }
  const dashboard = source('nextjs_dash_quality');
  assert.match(dashboard, /scope: \$\{\{ steps.scope.outputs.run }}/);
  assert.match(dashboard, /if: needs.quality.outputs.scope != 'false'/, 'Missing routing evidence must still fail the coverage proxy');
  const coverage = source('java_coverage');
  assert.match(coverage, /run: mvn verify -B -q -Dcheckstyle.skip=true/);
  const codeql = source('codeql');
  assert.doesNotMatch(codeql, /-DskipTests verify/);
  assert.match(codeql, /\[\[ "\$mod_dir" != "utils\/orchestrator" ]] \|\| continue/);
  assert.match(codeql, /--argjson checked "\$modules_checked"/);
  const pom = readFileSync(new URL('../../utils/orchestrator/pom.xml', import.meta.url), 'utf8');
  assert.match(pom, /<id>quality<\/id>\s*<activation>\s*<activeByDefault>true<\/activeByDefault>/);
  assert.ok(!pom.includes('quality.profile.id'), 'Profile selection happens before property interpolation');
});

test('PMD rechecks cached bytes before extraction and never downloads an existing archive', (t) => {
  const bash = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  if (bash.error?.code === 'ENOENT') return t.skip('Bash required');
  assert.equal(bash.status, 0, bash.stderr);
  const workflow = source('pmd');
  const install = workflow.split('      - name: Install PMD\n')[1].split('      - name: Run PMD\n')[0];
  assert.match(install, /timeout-minutes: 6/);
  assert.match(install, /--retry-max-time 60/);
  const script = install.split('        run: |\n')[1].replace(/^ {10}/gm, '');
  for (const valid of [true, false]) {
    const root = temporaryDirectory(t, 'pmd-cache-');
    mkdirSync(join(root, 'pmd-download'));
    writeFileSync(join(root, 'pmd-download/pmd.zip'), valid ? 'verified' : 'tampered');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c',
      `curl() { echo unexpected-download >&2; return 99; }\nunzip() { touch "$RUNNER_TEMP/extracted"; }\n${script}`], {
      cwd: root, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: '.',
        PMD_VERSION: '7.29.0', PMD_SHA256: createHash('sha256').update('verified').digest('hex'),
        GITHUB_PATH: './path' },
    });
    assert.equal(result.status, valid ? 0 : 1, result.stderr);
    assert.equal(existsSync(join(root, 'extracted')), valid);
    assert.ok(!result.stderr.includes('unexpected-download'));
  }
});

test('Renovate owns version PRs while Dependabot retains its separate security-update channel', () => {
  const dependabot = readFileSync(new URL('../../.github/dependabot.yml', import.meta.url), 'utf8');
  const ecosystems = dependabot.split('  - package-ecosystem:').slice(1);
  assert.ok(ecosystems.length > 0);
  for (const ecosystem of ecosystems) assert.match(ecosystem, /open-pull-requests-limit: 0/);
  assert.match(dependabot, /applies-to: security-updates/);
  const renovate = JSON.parse(readFileSync(new URL('../../renovate.json', import.meta.url), 'utf8'));
  assert.ok(!renovate.enabledManagers, 'Do not accidentally restrict ordinary manager discovery');
  assert.equal(renovate.vulnerabilityAlerts.enabled, true);
  assert.ok(renovate.packageRules.some((rule) => rule.groupName === 'CodeQL action' && rule.matchManagers.includes('github-actions')));
});
