import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { modules } from './java-modules.mjs';
import { catalog } from './pages/github-reports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = (name) => readFileSync(join(root, '.github/workflows', `${name}.yml`), 'utf8').replaceAll('\r\n', '\n');

test('every external action is SHA-pinned and checkouts do not persist credentials', () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.ya?ml$/.test(entry.name)) {
        const source = readFileSync(path, 'utf8');
        for (const [, ref] of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
          if (!ref.startsWith('./')) assert.match(ref, /^[^@]+@[a-f0-9]{40}$/, `${path}: ${ref}`);
        }
        const checkoutCount = (source.match(/uses: actions\/checkout@/g) || []).length;
        assert.equal((source.match(/persist-credentials: false/g) || []).length, checkoutCount, path);
      }
    }
  }
  inspect(join(root, '.github'));
});

test('PR workflows cancel stale work and support merge queues', () => {
  for (const file of readdirSync(join(root, '.github/workflows'))) {
    const source = workflow(file.replace('.yml', ''));
    if (!/^ {2}pull_request:/m.test(source)) continue;
    assert.match(source, /^ {2}merge_group:/m, file);
    assert.match(source, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' }}/, file);
  }
});

test('coverage is the single Go/Django test owner, including weekly scans', () => {
  assert.doesNotMatch(workflow('go_quality'), /run: go test/);
  assert.match(workflow('go_coverage'), /go test \.\/\.\.\. -race -count=1/);
  assert.doesNotMatch(workflow('django_python_quality'), /manage.py test|needs: common/);
  assert.match(workflow('django_python_coverage'), /manage.py test obbench_django_common.tests/);
  for (const name of ['go_coverage', 'django_python_coverage']) assert.match(workflow(name), /^ {2}schedule:/m);
  assert.match(workflow('django_python_coverage'), /include-hidden-files: 'true'/);
});

test('coverage inventory supplies both JVM consumers without changing module identities', () => {
  for (const module of modules) assert.ok(existsSync(join(root, module.module_dir, 'pom.xml')));
  assert.match(workflow('java_coverage'), /matrix: \$\{\{ fromJSON\(needs.inventory.outputs.matrix\) }}/);
  assert.match(workflow('codeql'), /node scripts\/java-modules.mjs --paths/);
});

test('Pages preserves its trust boundary and producer catalog contracts', () => {
  const pages = workflow('pages');
  assert.equal((pages.match(/ref: refs\/heads\/main/g) || []).length, 4);
  assert.equal((pages.match(/ref: \$\{\{ needs.inventory.outputs.source_sha }}/g) || []).length, 0);
  assert.deepEqual([...pages.matchAll(/^ +ref: (.+)$/gm)].map((match) => match[1]), Array(4).fill('refs/heads/main'));
  assert.equal((pages.match(/EXPECTED_SHA: \$\{\{ needs.inventory.outputs.source_sha }}/g) || []).length, 3);
  assert.equal((pages.match(/CHECKED_OUT_SHA: \$\{\{ steps.checkout.outputs.commit }}/g) || []).length, 3);
  assert.equal((pages.match(/run: test "\$CHECKED_OUT_SHA" = "\$EXPECTED_SHA"/g) || []).length, 3);
  assert.match(pages, /head_repository.full_name == github.repository/);
  assert.match(pages, /needs: \[inventory, docs, collect]/);
  assert.match(pages, /max-parallel: 5/);
  for (const producer of catalog) {
    assert.ok(pages.includes(producer.name));
    const source = workflow(producer.workflow.replace('.yml', ''));
    for (const report of producer.reports) {
      assert.ok(source.includes(report.artifact) || (producer.id === 'qodana' && source.includes('qodana-report-${{ matrix.name }}')), report.artifact);
    }
  }
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
