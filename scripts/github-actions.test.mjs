import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const githubDir = fileURLToPath(new URL('../.github/', import.meta.url));
const actions = [
  { name: 'setup-python', upstream: 'actions/setup-python', inputs: ['python-version', 'cache', 'cache-dependency-path'] },
  { name: 'setup-node', upstream: 'actions/setup-node', inputs: ['node-version', 'cache', 'cache-dependency-path'] },
  { name: 'setup-go', upstream: 'actions/setup-go', inputs: ['go-version-file', 'cache', 'cache-dependency-path'] },
  { name: 'codecov-upload', upstream: 'codecov/codecov-action', inputs: ['files', 'flags', 'name', 'token', 'fail_ci_if_error', 'disable_search'] },
];

function readYaml(path) {
  return readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
}

function yamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return entry.isFile() && /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

function references(source) {
  return [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
}

test('centralized action revisions occur only in their shared wrappers', () => {
  const sources = yamlFiles(githubDir).map((path) => ({ path, source: readYaml(path) }));
  for (const { name, upstream, inputs } of actions) {
    const wrapperPath = join(githubDir, 'actions', name, 'action.yml');
    const source = readYaml(wrapperPath);
    assert.match(source, /^ {2}using: composite$/m);
    const occurrences = sources.flatMap(({ path, source }) =>
      references(source).filter((ref) => ref.split('@')[0] === upstream).map((ref) => ({ path, ref })),
    );
    assert.equal(occurrences.length, 1, `${upstream} must have exactly one shared pin`);
    assert.equal(occurrences[0].path, wrapperPath, `${upstream} bypasses its wrapper`);
    assert.match(occurrences[0].ref.split('@')[1] ?? '', /^[a-f0-9]{40}$/, `${upstream} needs a full SHA`);
    assert.match(source, /^\s*uses: \S+@[a-f0-9]{40} +# v\d[^\r\n]*$/m);
    for (const input of inputs) {
      assert.ok(source.includes(`${input}: \${{ inputs.${input} }}`), `${name} must forward ${input}`);
    }
    assert.doesNotMatch(source, /\$\{\{\s*secrets\./, `${name} must receive secrets explicitly`);
  }
});

test('new wrappers preserve caller-selected execution and cache/upload defaults', () => {
  for (const name of ['setup-node', 'setup-go', 'codecov-upload']) {
    const source = readYaml(join(githubDir, 'actions', name, 'action.yml'));
    assert.match(source, /if: \$\{\{ always\(\) }}/, `${name} must respect callers running after failure`);
  }
  const node = readYaml(join(githubDir, 'actions', 'setup-node', 'action.yml'));
  assert.match(node, /node-version:\n[^\n]*\n {4}required: true/);
  assert.doesNotMatch(node, /default:/, 'Node versions and caching must remain caller-selected');
  const go = readYaml(join(githubDir, 'actions', 'setup-go', 'action.yml'));
  assert.match(go, /cache:\n[^\n]*\n {4}required: false\n {4}default: 'true'/);
  const codecov = readYaml(join(githubDir, 'actions', 'codecov-upload', 'action.yml'));
  assert.match(codecov, /fail_ci_if_error:\n[^\n]*\n {4}required: false\n {4}default: 'false'/);
  assert.match(codecov, /disable_search:\n[^\n]*\n {4}required: false\n {4}default: 'true'/);
});

test('path-filtered workflows include the shared actions they consume', () => {
  for (const path of yamlFiles(join(githubDir, 'workflows'))) {
    const source = readYaml(path);
    const refs = new Set(references(source));
    // Each paths block is checked separately so both push and PRs are covered.
    const filters = [...source.matchAll(/^ +paths:[ \t]*\r?\n((?: +-[^\r\n]*(?:\r?\n|$))+)/gm)];
    for (const { name } of actions) {
      if (!refs.has(`./.github/actions/${name}`)) continue;
      for (const [, filter] of filters) {
        assert.ok(
          filter.includes(`.github/actions/${name}/**`) || /['"]\.github\/actions\/\*\*['"]/.test(filter),
          `${path} must trigger on changes to ${name} in every paths filter`,
        );
      }
    }
  }
});
