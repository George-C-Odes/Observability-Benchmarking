import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(join(root, '.github/workflows/codeql.yml'), 'utf8').replaceAll('\r\n', '\n');

// Inspect the actual workflow, not a duplicate implementation of its build policy.
function step(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Missing step: ${name}`);
  const end = workflow.indexOf('\n      - name: ', start + marker.length);
  return workflow.slice(start, end === -1 ? undefined : end);
}

function jvmModules(directory) {
  const modules = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'native' && entry.name !== 'target') {
      modules.push(...jvmModules(path));
    } else if (entry.isFile() && entry.name === 'pom.xml') {
      const module = relative(root, dirname(path)).split(sep).join('/');
      if (module.split('/').includes('jvm')) modules.push(module);
    }
  }
  return modules;
}

test('every matrix language initializes, analyzes and uploads without change-based skips', () => {
  assert.doesNotMatch(step('Initialize CodeQL'), /^ {8}if:/m);
  assert.match(step('Initialize CodeQL'), /id: codeql-init/);
  assert.match(step('Perform CodeQL Analysis'), /^ {8}if: always\(\) && !cancelled\(\) && steps.codeql-init.outcome == 'success'\s*$/m);
  assert.match(step('Upload SARIF artifact'), /^ {8}if: always\(\) && !cancelled\(\)\s*$/m);
  assert.doesNotMatch(workflow, /java-changes|has_modules|git diff/);
  assert.match(workflow, /language: java-kotlin\s+(?:#[^\n]*\n\s+)*build-mode: manual/);
  assert.match(step('Initialize CodeQL'), /CODEQL_OVERLAY_DATABASE_MODE:.*'none'/);
});

test('Java setup and compilation depend only on the matrix language', () => {
  for (const name of ['Set up JDK 25', 'Build Java modules']) {
    assert.match(step(name), /^ {8}if: matrix\.language == 'java-kotlin'\s*$/m);
  }
  assert.match(step('Set up JDK 25'), /^ {10}cache: maven$/m);
});

test('every language uses a verified local bundle and the wrapper forwards tools', () => {
  assert.match(step('Resolve CodeQL bundle'), /node --test scripts\/codeql-bundle.test.mjs/);
  assert.match(step('Resolve CodeQL bundle'), /CODEQL_LANGUAGE: \$\{\{ matrix.language }}/);
  assert.match(step('Download CodeQL bundle'), /sha256sum --check --strict/);
  assert.match(step('Initialize CodeQL'), /tools: \$\{\{ runner.temp }}\/codeql-bundle.tar.zst/);
  const wrapper = readFileSync(join(root, '.github/actions/codeql-action/action.yml'), 'utf8');
  assert.match(wrapper, /tools: \$\{\{ inputs.tools }}/);
  assert.equal(workflow.split("- 'scripts/codeql-bundle*.mjs'").length - 1, 2);
});

test('fresh Java databases compile all JVM services plus the orchestrator, excluding native builds', () => {
  const build = step('Build Java modules');
  const registry = build.match(/SERVICE_MODULES=\(\s*([\s\S]*?)\s*\)/);
  assert.ok(registry, 'Missing service module registry');
  const declared = registry[1].trim().split(/\s+/);
  const expected = jvmModules(join(root, 'services/java'));
  assert.ok(expected.length > 0);
  assert.ok(existsSync(join(root, 'utils/orchestrator/pom.xml')));
  assert.deepEqual([...declared, 'utils/orchestrator'].sort(), [...expected, 'utils/orchestrator'].sort());
  assert.ok(build.includes('build_modules=( "${SERVICE_MODULES[@]}" utils/orchestrator )'));
  assert.equal((build.match(/build_modules=/g) || []).length, 1, 'Do not narrow the registry by changed paths');
  assert.equal(build.split('for mod_dir in "${build_modules[@]}"; do').length - 1, 2);
  assert.match(build, /mvn -f "\$mod_dir\/pom\.xml" compile/);
});

test('CodeQL keeps its language category and per-language SARIF artifacts', () => {
  assert.ok(step('Perform CodeQL Analysis').includes('category: "/language:${{ matrix.language }}"'));
  assert.ok(step('Upload SARIF artifact').includes('name: codeql-sarif-${{ matrix.language }}'));
  assert.match(step('Download all SARIF artifacts'), /merge-multiple: false/);
});

test('optional build warnings use a zero-match-safe pattern and retain the report input path', () => {
  const download = step('Download build warnings');
  assert.match(download, /^ {10}pattern: codeql-build-warnings$/m);
  assert.doesNotMatch(download, /^ {10}name:/m);
  assert.match(download, /^ {10}path: \.codeql-build-warnings$/m);
  assert.match(download, /^ {10}merge-multiple: true$/m);
  assert.match(step('Upload build warnings'), /^ {10}name: codeql-build-warnings$/m);
});

test('Java quality failures remain blocking only after analysis and artifact uploads', () => {
  const gate = workflow.indexOf('      - name: Fail on Java quality violations\n');
  for (const name of ['Perform CodeQL Analysis', 'Upload SARIF artifact', 'Upload build warnings']) {
    assert.ok(gate > workflow.indexOf(`      - name: ${name}\n`));
  }
  assert.match(step('Fail on Java quality violations'), /steps\.build-java\.outputs\.java_quality_failed == '1'/);
  assert.match(step('Fail on Java quality violations'), /exit 1/);
});


