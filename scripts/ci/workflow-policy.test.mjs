import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { modules } from '../coverage/java-modules.mjs';
import { catalog, collectionPlan } from '../pages/github-reports.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = (name) => readFileSync(join(root, '.github/workflows', `${name}.yml`), 'utf8').replaceAll('\r\n', '\n');

test('external actions are SHA-pinned and checkouts share one revision without persisted credentials', () => {
  const checkoutRevisions = new Map();
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.ya?ml$/.test(entry.name)) {
        const source = readFileSync(path, 'utf8');
        for (const [, ref, comment] of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)([^\r\n]*)/gm)) {
          if (!ref.startsWith('./')) assert.match(ref, /^[^@]+@[a-f0-9]{40}$/, `${path}: ${ref}`);
          if (ref.startsWith('actions/checkout@')) {
            // Compare the version token while retaining local review comments,
            // such as Pages' scoped NOSONAR explanations after the semicolon.
            const version = /^\s+#\s+(v\d+\.\d+\.\d+)(?=[;\s]|$)/.exec(comment)?.[1];
            assert.ok(version, `${path}: checkout needs a # vX.Y.Z version comment`);
            const revision = `${ref} # ${version}`;
            const paths = checkoutRevisions.get(revision) ?? [];
            paths.push(path);
            checkoutRevisions.set(revision, paths);
          }
        }
        const checkoutCount = (source.match(/uses: actions\/checkout@/g) || []).length;
        assert.equal((source.match(/persist-credentials: false/g) || []).length, checkoutCount, path);
      }
    }
  }
  inspect(join(root, '.github'));
  assert.equal(checkoutRevisions.size, 1,
    `All checkout references must share one SHA and version comment. Found: ${JSON.stringify([...checkoutRevisions])}`);
});

test('Checkov scans source configuration without secrets and preserves failure evidence', () => {
  const source = workflow('checkov');
  assert.match(source, /framework: \[github_actions, dockerfile]/);
  assert.match(source, /framework: github_actions\n +directory: \.github\/workflows/);
  assert.match(source, /framework: dockerfile\n +directory: \./);
  assert.match(source, /run: install -d -m 0777 checkov-results/);
  assert.ok(source.indexOf('run: install -d -m 0777 checkov-results') < source.indexOf('uses: ./.github/actions/checkov'));
  for (const event of ['pull_request', 'merge_group', 'push', 'workflow_dispatch', 'schedule']) {
    assert.match(source, new RegExp(`^ {2}${event}:`, 'm'));
  }
  assert.match(source, /fail-fast: false/);
  assert.match(source, /uses: \.\/\.github\/actions\/checkov/);
  const scan = source.split('      - name: Checkov GitHub Action\n')[1].split('      - name: Retain Checkov report\n')[0];
  assert.match(scan, /env:\n +CKV_IGNORE_HIDDEN_DIRECTORIES: 'false'/);
  const action = readFileSync(join(root, '.github/actions/checkov/action.yml'), 'utf8');
  assert.match(action, /image: Dockerfile/);
  const dockerfile = readFileSync(join(root, '.github/actions/checkov/Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM bridgecrew\/checkov:\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /^USER 65532:65532$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/bin\/env", "HOME=\/tmp", "\/usr\/local\/bin\/checkov"]$/m);
  assert.match(action, /- --download-external-modules\r?\n +- +'false'/);
  assert.doesNotMatch(action, /GITHUB_ENV|GITHUB_OUTPUT|set-output|--soft-fail|--skip-check|--baseline/);
  assert.doesNotMatch(source, /continue-on-error:|secrets\.|pull_request_target:|skip_check:|baseline:/);
  const retention = source.split('      - name: Retain Checkov report\n')[1].split('      - name: Upload Checkov')[0];
  assert.match(retention, /if: always\(\) && !cancelled\(\)/);
  assert.match(retention, /if-no-files-found: error/);
  const upload = source.split('      - name: Upload Checkov to Code Scanning\n')[1];
  assert.match(upload, /always\(\) && !cancelled\(\)/);
  assert.match(upload, /github\.actor != 'dependabot\[bot]'/);
  assert.match(upload, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(upload, /sarif_file: checkov-results\/results_sarif\.sarif/);
  assert.match(upload, /category: checkov-\$\{\{ matrix\.framework }}/);
  const config = readFileSync(join(root, '.github/checkov.yml'), 'utf8');
  assert.match(config, /output-file-path: checkov-results/);
  assert.match(config, /skip-download: true/);
  assert.doesNotMatch(config, /^ *(?:soft-fail|baseline|check):/m);
});

test('Semgrep runs a pinned non-root scanner, scopes its token and fails closed', () => {
  const source = workflow('semgrep');
  for (const event of ['pull_request', 'merge_group', 'push', 'workflow_dispatch', 'schedule']) {
    assert.match(source, new RegExp(`^ {2}${event}:`, 'm'));
  }
  assert.match(source, /^permissions: \{}$/m);
  assert.doesNotMatch(source, /continue-on-error:|pull_request_target:|workflow_run:|zizmor: ignore/);
  // The job-level flag exposes only whether the secret exists; the token
  // itself reaches the scanner step alone.
  assert.equal((source.match(/secrets\.SEMGREP_APP_TOKEN/g) || []).length, 2);
  assert.match(source, /SEMGREP_ENABLED: \$\{\{ secrets\.SEMGREP_APP_TOKEN != '' }}/);
  const scan = source.split('      - name: Semgrep scan\n')[1].split('      - name: Retain Semgrep report\n')[0];
  assert.match(scan, /uses: \.\/\.github\/actions\/semgrep\n/);
  assert.match(scan, /env:\n +SEMGREP_APP_TOKEN: \$\{\{ secrets\.SEMGREP_APP_TOKEN }}\n/);
  assert.match(source, /fetch-depth: 0/);
  // semgrep ci would otherwise switch a PR merge checkout to the head itself.
  assert.match(source, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha }}\n +fetch-depth: 0\n/);
  // The non-root scanner fetches into .git and resets tracked files in place
  // for PR baselines. Grant only its UID through ACLs read from the Dockerfile;
  // never world-writable modes or ownership changes.
  const prepare = source.split('      - name: Prepare Semgrep workspace\n')[1].split('      - name: Semgrep scan\n')[0];
  assert.ok(prepare.includes("sed -nE 's/^USER ([0-9]+):[0-9]+$/\\1/p' .github/actions/semgrep/Dockerfile"));
  assert.ok(prepare.indexOf('install -d -m 0755 semgrep-results\n') < prepare.indexOf('setfacl'));
  assert.match(prepare, /setfacl -R -m "u:\$\{scanner_uid}:rwX" \.\n/);
  assert.doesNotMatch(prepare, /chmod|0777|a\+w|o\+w|chown|sudo/);
  const action = readFileSync(join(root, '.github/actions/semgrep/action.yml'), 'utf8');
  assert.match(action, /image: Dockerfile/);
  assert.match(action, /- ci\r?\n/);
  assert.match(action, /- --no-suppress-errors\r?\n/);
  assert.doesNotMatch(action, /GITHUB_ENV|GITHUB_OUTPUT|--dry-run|--baseline-commit|\|\| true/);
  const dockerfile = readFileSync(join(root, '.github/actions/semgrep/Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM semgrep\/semgrep:\d+\.\d+\.\d+-nonroot@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /^USER [1-9]\d*:[1-9]\d*$/m);
  assert.match(dockerfile, /"GIT_CONFIG_KEY_0=safe\.directory", "GIT_CONFIG_VALUE_0=\/github\/workspace", "semgrep"]$/m);
  const retention = source.split('      - name: Retain Semgrep report\n')[1].split('      - name: Upload Semgrep')[0];
  assert.match(retention, /if: always\(\) && !cancelled\(\)/);
  assert.match(retention, /if-no-files-found: error/);
  const upload = source.split('      - name: Upload Semgrep to Code Scanning\n')[1].split('      - name: Enforce Semgrep findings gate\n')[0];
  assert.match(upload, /always\(\) && !cancelled\(\)/);
  assert.match(upload, /sarif_file: semgrep-results\/semgrep\.sarif/);
  assert.match(upload, /category: semgrep\n/);
  // Every unsuppressed finding fails the job after evidence is retained and
  // uploaded, and the gate receives the scan outcome so failures stay failures.
  const gate = source.split('      - name: Enforce Semgrep findings gate\n')[1];
  assert.match(gate, /if: always\(\) && !cancelled\(\) && env\.SEMGREP_ENABLED == 'true'\n/);
  assert.match(gate, /SCAN_OUTCOME: \$\{\{ steps\.scan\.outcome }}\n/);
  assert.match(gate, /run: node scripts\/scanners\/semgrep-report\.mjs\n$/);
  assert.match(scan, /id: scan\n/);
});

test('PR workflows cancel stale work and support merge queues', () => {
  for (const file of readdirSync(join(root, '.github/workflows'))) {
    const source = workflow(file.replace('.yml', ''));
    if (!/^ {2}pull_request:/m.test(source)) continue;
    // On-demand label triggers validate nothing, so merge queues need no run.
    const labelOnly = /^ {2}pull_request:\n {4}types: \[labeled]\n/m.test(source);
    if (!labelOnly) assert.match(source, /^ {2}merge_group:/m, file);
    assert.match(source, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' }}/, file);
  }
});

test('Claude review stays label-only, read-only and limited to same-repository PRs', () => {
  const source = workflow('claude_review');
  assert.match(source, /^permissions: \{}$/m);
  // Comment and review events cannot be filtered by author or text, so every
  // bot comment would register a skipped run.
  assert.match(source, /^on:\n {2}pull_request:\n {4}types: \[labeled]\n\n/m);
  assert.doesNotMatch(source, /issue_comment:|pull_request_review|pull_request_target:|workflow_run:|zizmor: ignore/);
  assert.doesNotMatch(source, /allow_fork_prs|allowed_bots|allowed_non_write_users|restrict_untrusted_prs|bypassPermissions|github_token:|trigger_phrase:/);
  const review = source.split(/^ {2}review:\s*$/m)[1].split(/^ {2}release-label:\s*$/m)[0];
  assert.match(review, /github\.event\.label\.name == 'claude-review' &&\n +github\.event\.pull_request\.head\.repo\.full_name == github\.repository\n/);
  assert.match(review, /^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n {6}id-token: write\n {4}\S/m);
  assert.deepEqual([...review.matchAll(/^ +ref: (.+)$/gm)].map((match) => match[1]), ['refs/heads/main']);
  assert.ok(review.indexOf('Stage trusted review contract') < review.indexOf('uses: anthropics/claude-code-action@'));
  assert.match(review, /uses: anthropics\/claude-code-action@[a-f0-9]{40} # v\d+\.\d+\.\d+\n/);
  assert.match(review, /claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN }}/);
  assert.match(review, /additional_permissions: \|\n +contents: read\n/);
  assert.match(review, /--model claude-opus-5-5\n +--permission-mode default\n/);
  assert.match(review, /--add-dir \$\{\{ runner\.temp }}\/claude-review\n/);
  // git diff/log/show accept --output, which writes arbitrary runner files.
  assert.match(review, /--allowedTools "mcp__github_inline_comment__create_inline_comment,Bash\(gh pr diff:\*\),Bash\(gh pr view:\*\)"\n/);
  assert.match(review, /--disallowedTools "Edit,MultiEdit,Write,NotebookEdit,Bash\(git add:\*\),Bash\(git rm:\*\),Bash\(git commit:\*\),Bash\(git push:\*\)"/);
  // The action's built-in prompt suggests git diff; steer Claude to the allowed command.
  assert.match(review, /Get the diff with `gh pr diff /);
  assert.equal((source.match(/secrets\./g) || []).length, 1, 'The OAuth token is passed only to the action');
  const release = source.split(/^ {2}release-label:\s*$/m)[1];
  assert.match(release, /^ {4}needs: review\n {4}if: always\(\) && needs\.review\.result != 'skipped'\n/m);
  assert.match(release, /^ {4}permissions:\n {6}pull-requests: write\n {4}\S/m);
  assert.doesNotMatch(release, /uses:|secrets\./);
});

test('Codex Security scans only labeled, trusted PR snapshots with a step-scoped API key', () => {
  const source = workflow('codex-security');
  assert.match(source, /^on:\n {2}pull_request:\n {4}types: \[labeled]\n {4}branches: \[main]\n\npermissions: \{}$/m);
  assert.match(source, /github\.event\.label\.name == 'codex-security' &&\n +github\.event\.pull_request\.state == 'open' &&\n +github\.event\.pull_request\.head\.repo\.full_name == github\.repository &&\n +github\.event\.pull_request\.user\.login != 'dependabot\[bot]' &&\n +github\.actor != 'dependabot\[bot]'/);
  assert.match(source, /^ {4}concurrency:\n {6}group: codex-security-pr-\$\{\{ github\.event\.pull_request\.number }}/m);
  assert.match(source, /^ {4}permissions:\n {6}contents: read\n {4}steps:/m);
  assert.match(source, /ref: \$\{\{ github\.event\.pull_request\.head\.sha }}\n +fetch-depth: 0\n +persist-credentials: false/);
  assert.deepEqual([...source.matchAll(/^ +uses: ([^@]+)@/gm)].map((match) => match[1]), [
    'actions/checkout', 'openai/codex-security',
  ]);
  assert.doesNotMatch(source, /^ +(?:run|continue-on-error|dry-run):/m);
  const scan = source.split('      - name: Scan PR changes\n')[1];
  assert.match(scan, /uses: openai\/codex-security@[a-f0-9]{40} # action-v\d+\.\d+\.\d+/);
  assert.match(scan, /scope: diff\n +max-cost: '5'\n +fail-on-severity: high/);
  assert.match(scan, /verbose: 'false'\n +summary: 'true'\n +annotations: 'false'\n +upload-artifacts: 'false'/);
  assert.match(scan, /env:\n +OPENAI_API_KEY: \$\{\{ secrets\.CODEX_SECURITY_API_KEY }}/);
  assert.equal((source.match(/secrets\./g) || []).length, 1);
});

test('coverage is the single Go/Django test owner, including weekly scans', () => {
  assert.doesNotMatch(workflow('go_quality'), /run: go test/);
  assert.match(workflow('go_coverage'), /go test \.\/\.\.\. -race -count=1/);
  assert.doesNotMatch(workflow('django_python_quality'), /manage.py test|needs: common/);
  assert.match(workflow('django_python_coverage'), /manage.py test obbench_django_common.tests/);
  assert.match(workflow('sonar'), /^ {2}schedule:/m);
  for (const name of ['go_coverage', 'django_python_coverage']) assert.ok(workflow('sonar').includes(`uses: ./.github/workflows/${name}.yml`));
  assert.match(workflow('django_python_coverage'), /include-hidden-files: 'true'/);
});

test('Django quality has one Ruff installation and independent semantic analysis', () => {
  const quality = workflow('django_python_quality');
  assert.deepEqual([...quality.matchAll(/^ {2}([a-z]+):$/gm)].map((match) => match[1])
    .filter((name) => ['common', 'modules', 'qodana'].includes(name)), ['common', 'qodana']);
  assert.equal((quality.match(/uses: \.\/\.github\/actions\/install-python-dependencies/g) || []).length, 1);
  assert.doesNotMatch(quality, /local-project:|compileall|run: .*manage\.py|requirements\.txt/);
  for (const operation of ['check', 'format --check']) {
    assert.ok(quality.includes(`python -m ruff ${operation} services/python/django/gunicorn/common services/python/django/gunicorn/WSGI services/python/django/gunicorn/ASGI`));
  }
  for (const runtime of ['WSGI', 'ASGI']) assert.ok(quality.includes(`${runtime}/requirements-dev.txt`));
  assert.match(quality, /test_sync_build_locks\.py/);
  assert.match(quality, /test_qodana_python\.py/);
  assert.doesNotMatch(quality, /^ +run: .*sync_build_locks\.py --check/m);
  assert.match(workflow('framework_versions'), /python services\/python\/django\/gunicorn\/sync_build_locks\.py --check/);
  const qodana = quality.split('\n  qodana:\n')[1];
  assert.doesNotMatch(qodana, /^ +needs:/m);
  assert.match(qodana, /fetch-depth: \$\{\{ github.event_name == 'merge_group' && '0' \|\| '1' }}/);
});

test('Django runtime environments install coverage without Ruff or repeated system checks', () => {
  const coverage = workflow('django_python_coverage');
  assert.doesNotMatch(coverage, /requirements-dev\.txt|ruff|compileall|manage\.py[" ]+check/);
  assert.equal((coverage.match(/manage\.py test obbench_django_common\.tests/g) || []).length, 1);
  assert.match(coverage, /default test runner performs system checks/);
  assert.match(coverage, /\.github\/requirements\/coverage\.in/);
  for (const runtime of ['WSGI', 'ASGI']) assert.ok(coverage.includes(`module_dir: services/python/django/gunicorn/${runtime}`));
});

test('pip cache keys track consumed locks rather than unrelated workflow requirements', () => {
  for (const name of ['django_python_quality', 'django_python_coverage', 'snyk-security']) {
    const source = workflow(name);
    const blocks = [...source.matchAll(/cache: pip\n +cache-dependency-path: \|\n((?: +[^\n]+\n)+?)(?=\n| {6}- name:)/g)];
    assert.ok(blocks.length > 0, `${name}: pip caching must remain enabled`);
    for (const [, block] of blocks) {
      assert.ok(!block.includes('.github/requirements/**'), name);
      for (const file of ['pip.in', 'pip.txt', 'python-ci.txt']) assert.ok(block.includes(`.github/requirements/${file}`), `${name}: ${file}`);
    }
  }
});

test('coverage inventory supplies both JVM consumers without changing module identities', () => {
  for (const module of modules) assert.ok(existsSync(join(root, module.module_dir, 'pom.xml')));
  assert.match(workflow('java_coverage'), /matrix: \$\{\{ fromJSON\(needs.inventory.outputs.matrix\) }}/);
  assert.match(workflow('codeql'), /node scripts\/coverage\/java-modules.mjs --paths/);
});

test('Pages preserves its trust boundary and producer catalog contracts', () => {
  const pages = workflow('pages');
  assert.equal((pages.match(/ref: refs\/heads\/main/g) || []).length, 4);
  assert.equal((pages.match(/ref: \$\{\{ needs.inventory.outputs.source_sha }}/g) || []).length, 0);
  assert.deepEqual([...pages.matchAll(/^ +ref: (.+)$/gm)].map((match) => match[1]), Array(4).fill('refs/heads/main'));
  assert.equal((pages.match(/EXPECTED_SHA: \$\{\{ needs.inventory.outputs.source_sha }}/g) || []).length, 3);
  assert.equal((pages.match(/CHECKED_OUT_SHA: \$\{\{ steps.checkout.outputs.commit }}/g) || []).length, 3);
  assert.equal((pages.match(/run: test "\$CHECKED_OUT_SHA" = "\$EXPECTED_SHA"/g) || []).length, 3);
  assert.equal((pages.match(/uses: actions\/checkout@[^\n]+NOSONAR/g) || []).length, 3);
  assert.match(pages, /head_repository.full_name == github.repository/);
  assert.match(pages, /needs: \[inventory, docs, collect]/);
  assert.match(pages, /max-parallel: 5/);
  assert.match(pages, /REPORT_PRODUCER: \$\{\{ matrix.producer.producer }}/);
  assert.match(pages, /REPORT_ARTIFACT: \$\{\{ matrix.producer.report }}/);
  for (const producer of catalog) {
    assert.ok(pages.includes(producer.name));
    const source = workflow(producer.workflow.replace('.yml', ''));
    for (const report of producer.reports) {
      assert.ok(source.includes(report.artifact) || (producer.id === 'qodana' && source.includes('qodana-report-${{ matrix.name }}')), report.artifact);
    }
  }
});

test('Pages downloads each producer report into its own artifact directory', () => {
  const pages = workflow('pages');
  const steps = ['download', 'download_second'];
  for (const [index, id] of steps.entries()) {
    const entry = `matrix.producer.reports[${index}].artifact`;
    const step = pages.split(`        id: ${id}\n`)[1].split('\n      - name: ')[0];
    const condition = "steps.source.outputs.run_id != ''" + (index ? ` && ${entry} != ''` : '');
    assert.ok(step.includes(`if: ${condition}\n`));
    assert.ok(step.includes(`pattern: \${{ ${entry} }}\n`));
    assert.ok(step.includes(`path: .collected/\${{ ${entry} }}/\n`));
    assert.ok(step.includes('run-id: ${{ steps.source.outputs.run_id }}'));
    assert.ok(step.includes('uses: ./.github/actions/download-artifact'));
  }
  assert.match(pages, /DOWNLOAD_OUTCOME: \$\{\{ steps.download.outcome }}/);
  assert.match(pages, /SECOND_DOWNLOAD_OUTCOME: \$\{\{ steps.download_second.outcome }}/);
  for (const producer of collectionPlan) {
    assert.ok(producer.reports.length > 0 && producer.reports.length <= steps.length, producer.id);
    for (const report of producer.reports) assert.match(report.artifact, /^[a-z0-9-]+$/);
  }
});

test('manual dashboard quality runs as a Pages report producer without running a Sonar scan', () => {
  const coordinator = workflow('sonar');
  const dashboard = workflow('nextjs_dash_quality');
  const producer = catalog.find(({ id }) => id === 'nextjs');
  assert.match(coordinator, /workflow_dispatch:\n +inputs:\n +dashboard_only:\n +description: .+\n +type: boolean\n +default: false/);
  for (const job of ['java', 'go', 'python']) {
    assert.match(coordinator, new RegExp(String.raw`^  ${job}:\n {4}if: \$\{\{ !inputs\.dashboard_only }}$`, 'm'));
  }
  assert.match(coordinator, / {2}dashboard:\n(?: {4}#.*\n)* {4}uses: \.\/\.github\/workflows\/nextjs_dash_quality.yml/);
  assert.match(coordinator, / {2}scan:\n[^]*? {4}if: >-\n {6}!inputs\.dashboard_only &&/);
  assert.doesNotMatch(dashboard, /^ {2}workflow_dispatch:/m);
  assert.equal(producer.workflow, 'sonar.yml');
  assert.ok(workflow('pages').includes(producer.name));
  assert.ok(dashboard.includes(`name: ${producer.reports[0].artifact}`));
});

test('Pages restores compiled docs without cache writes on workflow_run and rebuilds on misses', () => {
  const docs = workflow('pages').split('\n  docs:\n')[1].split('\n  collect:\n')[0];
  const cache = docs.split('      - name: Restore compiled documentation\n')[1].split('      - name: Set up Ruby\n')[0];
  assert.match(cache, /uses: \.\/\.github\/actions\/cache/);
  assert.match(cache, /path: _site\n/);
  assert.match(cache, /restore-only: \$\{\{ github.event_name == 'workflow_run' }}/);
  assert.equal((docs.match(/if: steps.site-cache.outputs.cache-hit != 'true'/g) || []).length, 2);
  assert.match(docs, /bundle exec jekyll build --destination \.\.\/_site/);
  assert.match(docs, /name: Upload base site/);
  assert.doesNotMatch(docs, /actions: write|cache-mode: write/);
});

test('Pages uploads the hidden report collection and retains missing-file failures', () => {
  const pages = workflow('pages');
  const upload = pages.split('      - name: Upload report collection\n')[1]?.split('\n  build:')[0];
  assert.ok(upload, 'Collection upload step must exist');
  assert.match(upload, /uses: \.\/\.github\/actions\/upload-artifact/);
  assert.match(upload, /path: \.collected\//);
  assert.match(upload, /include-hidden-files: 'true'/);
  assert.match(upload, /if-no-files-found: error/);
});

test('the repository landing page uses the root README', () => {
  assert.ok(existsSync(join(root, 'README.md')));
  assert.ok(!readdirSync(join(root, '.github')).some((name) => /^readme(?:\.|$)/i.test(name)),
    'A .github README takes precedence over the root README');
  assert.ok(existsSync(join(root, '.github/AUTOMATION.md')));
});

test('unfiltered validation enforces shell, security, request-boundary and Pages tests', () => {
  const source = workflow('workflow_quality');
  assert.doesNotMatch(source, /^ +paths:/m);
  for (const tool of ['actionlint', 'shellcheck', 'zizmor', 'scripts/pages/*.test.mjs', 'npm run check --prefix scripts/quality', 'npm test --prefix scripts/quality']) assert.ok(source.includes(tool));
  assert.match(source, /--require-hashes/);
  const snyk = workflow('snyk-security');
  assert.match(snyk, /snyk-version: v\d+\.\d+\.\d+/);
  assert.doesNotMatch(snyk, /^ {6}SNYK_TOKEN:/m, 'Token must not be job-wide');
  assert.match(readFileSync(join(root, 'qodana.yaml'), 'utf8'), /qodana-jvm-community:\S+@sha256:[a-f0-9]{64}/);
});

test('Renovate verifies the main revision before executing repository code', () => {
  const source = workflow('renovate_framework_sync');
  assert.match(source, /branches: \[main]/);
  assert.match(source, /^permissions: \{}$/m);
  const jobs = source.split(/^ {2}(?:synchronize|generate-apm|publish-apm):\s*$/m).slice(1);
  assert.equal(jobs.length, 3);
  for (const job of jobs) {
    assert.match(job, /^ {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n {4}\S/m);
    assert.deepEqual([...job.matchAll(/^ +ref: (.+)$/gm)].map((match) => match[1]), ['refs/heads/main']);
    assert.match(job, /persist-credentials: false/);
    assert.doesNotMatch(job, /^ +(?:repository|allow-unsafe-pr-checkout):/m);
    assert.match(job, /BASE_SHA: \$\{\{ github.event.pull_request.base.sha }}/);
    assert.match(job, /git rev-parse HEAD\)" != "\$BASE_SHA"[\s\S]*?exit 1[\s\S]*?uses: \.\/\.github\/actions\/setup-node/);
  }
});

test('Renovate runs the full APM upgrade apart from the lockfile publication token', () => {
  const source = workflow('renovate_framework_sync');
  const [, generate, publish] = source.split(/^ {2}(?:generate-apm|publish-apm):\s*$/m);
  assert.match(generate, /user\.login == 'renovate\[bot]'[\s\S]*?head\.repo\.full_name == github\.repository[\s\S]*?contains\([^\n]+ 'apm-version'\)/);
  assert.match(generate, /prepare-apm[\s\S]*?APM_NO_SCRIPTS: '1'[\s\S]*?python scripts\/upgrade-apm\.py\r?\n/);
  assert.doesNotMatch(generate, /secrets\.|RENOVATE_SYNC_TOKEN/);
  assert.match(publish, /needs: generate-apm/);
  assert.match(publish, /APM_GENERATED_HEAD_SHA: \$\{\{ needs.generate-apm.outputs.head_sha }}[\s\S]*?prepare-apm/);
  assert.match(publish, /RENOVATE_SYNC_TOKEN: \$\{\{ secrets.RENOVATE_SYNC_TOKEN }}[\s\S]*?APM_GENERATED_LOCK: \$\{\{ needs.generate-apm.outputs.lockfile }}[\s\S]*?run: node scripts\/versions\/renovate-framework-sync.mjs publish/);
  assert.doesNotMatch(publish, /upgrade-apm\.py/);
});

test('Qodana routes scopes without dropping check names or weakening full analysis', () => {
  const source = workflow('qodana_code_quality');
  assert.match(source, /pull_request:\n {2}push:/);
  assert.match(source, /qodana:\n +needs: changes\n +if: always\(\) && !cancelled\(\)/);
  assert.match(source, /SCAN_ENABLED: \$\{\{ needs.changes.outputs\[matrix.name] }}/);
  assert.match(source, /name: Require valid scope selection\n +if: env.SCAN_ENABLED != 'true' && env.SCAN_ENABLED != 'false'\n +run: exit 1/);
  for (const name of ['services-java', 'orchestrator']) assert.ok(source.includes(`- name: ${name}`));
  for (const step of ['Checkout', 'Test Qodana CLI release lookup', 'Install Qodana CLI', 'Prepare Qodana arguments', 'Qodana Scan']) {
    assert.ok(source.includes(`- name: ${step}\n        if: env.SCAN_ENABLED == 'true'`), step);
  }
  assert.match(source, /if: always\(\) && !cancelled\(\) && env.SCAN_ENABLED == 'true'/);
  for (const key of ['primary-cache-key', 'additional-cache-key']) {
    const line = source.split('\n').find((line) => line.trimStart().startsWith(`${key}:`));
    for (const input of ['matrix.name', 'qodana.yaml', 'pom.xml', 'runner.arch']) assert.ok(line.includes(input));
    assert.ok(!line.includes('github.ref'), 'PRs must be able to restore matching main caches');
  }
  assert.match(source, /cache-default-branch-only: true/);
  assert.match(source, /pr-mode: false/);
  assert.match(source, /env-vars-to-linter: QODANA_ONLY_DIRECTORY,JAVA_TOOL_OPTIONS/);
  assert.ok(workflow('workflow_quality').includes('scripts/scanners/qodana-scopes.test.mjs'));
});
