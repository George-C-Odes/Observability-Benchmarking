import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { validateVersionChange } from './renovate-framework-sync.mjs';
import { nodeGeneratedPaths, readNodeVersion, syncNodeContent } from './sync-node-versions.mjs';

test('Node upgrades are strictly parsed and accepted without authorizing Java or other env edits', () => {
  const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
  for (const [major, minorPatch] of [['28', '0.0'], ['26', '13.1']]) {
    const updated = env.replace(/^NODE_MAJOR_VERSION:.*$/m, `NODE_MAJOR_VERSION: ${major}`)
      .replace(/^NODE_MINOR_PATCH_VERSION:.*$/m, `NODE_MINOR_PATCH_VERSION: ${minorPatch}`);
    assert.equal(readNodeVersion(parseColonEnv(updated)).full, `${major}.${minorPatch}`);
    assert.ok(validateVersionChange(env, updated).every((key) => key.startsWith('NODE_')));
    assert.throws(() => validateVersionChange(env, updated.replace(/^JAVA_MAJOR_VERSION:.*$/m, 'JAVA_MAJOR_VERSION: 99')), /only active/);
  }
  for (const key of ['NODE_MAJOR_VERSION', 'NODE_MINOR_PATCH_VERSION']) {
    for (const value of [undefined, '', '.13.0', '13.0-rc1', '${VERSION}', '26\r', '26\n', '13.0\r', '13.0\n']) {
      assert.throws(() => readNodeVersion({ NODE_MAJOR_VERSION: '26', NODE_MINOR_PATCH_VERSION: '13.0', [key]: value }), /must be/);
    }
    assert.throws(() => validateVersionChange(env, `${env}\n${key}: 99\n`), /one literal/);
  }
});

test('Renovate extracts one complete Node release and rewrites both fields for major and patch upgrades', () => {
  const config = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
  const manager = config.customManagers.find(({ datasourceTemplate }) => datasourceTemplate === 'node-version');
  assert.equal(manager.depNameTemplate, 'node');
  const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
  // These templates contain only direct field substitutions, no helper expressions.
  const render = (template, fields) => template.replace(/\{\{\{(\w+)}}}/g, (_match, key) => {
    assert.ok(Object.hasOwn(fields, key), key);
    return fields[key];
  });
  for (const sample of [env, env.replaceAll('\n', '\r\n'), '#NODE_MAJOR_VERSION: 20\n#NODE_MINOR_PATCH_VERSION: 0.0\nNODE_MAJOR_VERSION: 26\nNODE_MINOR_PATCH_VERSION: 13.0\n']) {
    const expression = new RegExp(manager.matchStrings[0], 'g');
    const matches = [...sample.matchAll(expression)];
    assert.equal(matches.length, 1);
    assert.equal(render(manager.currentValueTemplate, matches[0].groups), '26.13.0');
    for (const [newMajor, newMinor, newPatch] of [['28', '0', '0'], ['26', '13', '1']]) {
      const updated = sample.replace(expression, (...args) => render(manager.autoReplaceStringTemplate, { ...args.at(-1), newMajor, newMinor, newPatch }));
      assert.equal(readNodeVersion(parseColonEnv(updated)).full, `${newMajor}.${newMinor}.${newPatch}`);
      const masked = (value) => value.replace(/^(NODE_(?:MAJOR|MINOR_PATCH)_VERSION: )[^\r\n]+/gm, '$1<version>');
      assert.equal(masked(updated), masked(sample));
    }
  }
  const rule = config.packageRules.find(({ description }) => description.startsWith('Node Docker tag'));
  assert.equal(rule.enabled, false);
  assert.ok(!rule.matchUpdateTypes.includes('digest'));
});

test('Node runtime inventory propagates a full release without changing action pins or unrelated settings', () => {
  const current = readNodeVersion(parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8')));
  const next = { major: '28', minorPatch: '0.1', full: '28.0.1' };
  assert.ok(nodeGeneratedPaths.includes('.github/actions/setup-node/action.yml'));
  assert.ok(nodeGeneratedPaths.every((file) => !file.startsWith('.github/workflows/')));
  for (const file of nodeGeneratedPaths) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    assert.equal(syncNodeContent(original, file, current), original, file);
    const updated = syncNodeContent(original, file, next);
    assert.notEqual(updated, original, file);
    assert.equal(syncNodeContent(updated, file, next), updated, file);
    assert.equal(syncNodeContent(original.replaceAll('\n', '\r\n'), file, next), updated.replaceAll('\n', '\r\n'), file);
    if (file.endsWith('/Dockerfile')) {
      assert.match(updated, /node:28\.0\.1-alpine3\.24/);
      assert.doesNotMatch(updated, /node:28\.0\.1-[^\r\n]*@sha256:/);
      const pinned = original.replace(/(node:\d+\.\d+\.\d+-[a-z0-9.-]+)(?:@sha256:[a-f0-9]+)?/g,
        `$1@sha256:${'a'.repeat(64)}`);
      assert.equal(syncNodeContent(pinned, file, current), pinned);
      assert.doesNotMatch(syncNodeContent(pinned, file, next), /node:[^\r\n]*@sha256:/);
    } else {
      const actions = (content) => [...content.matchAll(/uses: [^\r\n]+/g)].map(([match]) => match);
      assert.deepEqual(actions(updated), actions(original));
    }
  }
});
