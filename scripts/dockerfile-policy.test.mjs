import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const generatedDirectories = new Set(['node_modules', 'vendor', 'target', 'build', 'dist', '.next', '.venv', 'venv', '_site', 'apm_modules']);

function* dockerfiles(directory) {
  for (const entry of readdirSync(new URL(`../${directory}`, import.meta.url), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory() && !generatedDirectories.has(entry.name)) yield* dockerfiles(file);
    else if (entry.isFile() && /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile)$/.test(entry.name)) yield file;
  }
}

const files = ['services', 'utils', '.github/actions'].flatMap((directory) => [...dockerfiles(directory)]);

function resolveImage(image, defaults) {
  for (let depth = 0; depth < 8 && image.includes('$'); depth += 1) {
    image = image.replace(/\$\{([A-Z0-9_]+)}|\$([A-Z0-9_]+)/g, (_, braced, plain) => {
      const key = braced ?? plain;
      assert.ok(defaults.has(key), `Missing image argument: ${key}`);
      return defaults.get(key);
    });
  }
  assert.ok(!image.includes('$'), `Unresolved image: ${image}`);
  return image;
}

function assertVersionedImage(image) {
  const [name, digest] = image.split('@');
  const lastComponent = name.split('/').at(-1);
  const tag = lastComponent.includes(':') ? lastComponent.split(':').at(-1) : undefined;
  assert.notEqual(tag, 'latest', `Mutable latest image: ${image}`);
  assert.ok(tag || digest, `Missing image version: ${image}`);
  if (digest) assert.match(digest, /^sha256:[a-f0-9]{64}$/, image);
}

function assertVersionedDefaults(source) {
  const defaults = new Map();
  const stages = new Set();
  let global = true;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    const arg = /^ARG\s+([A-Z0-9_]+)=(\S+)/i.exec(line);
    // Docker expands each default against the arguments declared before it.
    if (global && arg) defaults.set(arg[1], resolveImage(arg[2].replace(/^["']|["']$/g, ''), defaults));
    const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (!from) continue;
    global = false;
    const image = resolveImage(from[1], defaults);
    if (image !== 'scratch' && !stages.has(image.toLowerCase())) assertVersionedImage(image);
    if (from[2]) stages.add(from[2].toLowerCase());
  }
  assert.equal(global, false, 'Dockerfile must have a FROM instruction');
}

test('all Dockerfile image defaults remain versioned with image arguments resolved', () => {
  assert.ok(read('.github/workflows/workflow_quality.yml').includes('scripts/dockerfile-policy.test.mjs'));
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.doesNotThrow(() => assertVersionedDefaults(read(file)), file);
  }
});

test('image-default validation rejects missing, latest, unresolved and malformed pins', () => {
  for (const source of [
    'FROM example', 'FROM example:latest', 'FROM registry:5000/example',
    'ARG BASE=example:latest\nFROM ${BASE}', 'FROM ${MISSING}',
    'ARG BASE=${BASE}\nFROM ${BASE}', 'FROM example:1@sha256:bad',
  ]) assert.throws(() => assertVersionedDefaults(source), source);
  assertVersionedDefaults('ARG BASE=registry:5000/example:1.2\nFROM ${BASE} AS builder\nFROM builder AS runner');
  assertVersionedDefaults(`FROM example@sha256:${'a'.repeat(64)}`);
});

test('only the approved healthcheck and literal image-tag rules are excluded centrally', () => {
  const config = read('.github/checkov.yml').replace(/^ *#.*\r?\n/gm, '');
  const exclusions = /^skip-check:\r?\n((?: +-[^\r\n]+\r?\n)+)/m.exec(config)?.[1];
  assert.ok(exclusions, 'Central Checkov exclusions must be explicit');
  assert.deepEqual([...exclusions.matchAll(/- (\S+)/g)].map((match) => match[1]), ['CKV_DOCKER_2', 'CKV_DOCKER_7']);
  for (const file of files) assert.doesNotMatch(read(file), /checkov:skip=CKV_DOCKER_[27]\b/, file);
});

test('image arguments capture defaults at declaration before later reassignments', () => {
  assert.throws(() => assertVersionedDefaults(
    'ARG TAG=latest\nARG BASE=alpine:${TAG}\nARG TAG=3.21\nFROM ${BASE}',
  ), /Mutable latest image: alpine:latest/);
  assertVersionedDefaults('ARG TAG=3.21\nARG BASE=alpine:${TAG}\nARG TAG=latest\nFROM ${BASE}');
  assertVersionedDefaults('ARG TAG=3.21\nARG TAG=${TAG}.1\nFROM alpine:${TAG}');
});

test('indented instructions validate every stage and resolve versioned arguments', () => {
  for (const indent of [' ', '\t']) {
    assert.throws(() => assertVersionedDefaults(
      `FROM alpine:3.21 AS build\n${indent}FROM alpine:latest`,
    ), /Mutable latest image: alpine:latest/);
    assertVersionedDefaults(`${indent}arg TAG=3.21\n${indent}ARG BASE=alpine:\${TAG}\n${indent}from \${BASE} AS build\n${indent}FROM build`);
  }
});
