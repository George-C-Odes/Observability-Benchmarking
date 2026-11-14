import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { validateVersionChange } from './renovate-framework-sync.mjs';
import { nodeGeneratedPaths, nodeTestPaths, readNodeVersion, syncNodeContent } from './sync-node-versions.mjs';

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

test('Renovate rewrites one complete Node release while preserving separators accepted by the sync validator', () => {
  const config = JSON.parse(readFileSync(resolveRepoPath('renovate.json'), 'utf8'));
  const manager = config.customManagers.find(({ datasourceTemplate }) => datasourceTemplate === 'node-version');
  assert.equal(manager.depNameTemplate, 'node');
  // The inner replacements emit a literal $1 (via $$) for the outer
  // replacements to restore each key's original whitespace prefix.
  const env = readFileSync(resolveRepoPath('compose/.env'), 'utf8');
  const whitespaceSamples = [];
  for (const newline of ['\n', '\r\n']) {
    for (const majorSpace of ['', ' ', '   ', '\t', ' \t ']) {
      for (const minorSpace of ['', ' ', '   ', '\t', ' \t ']) {
        whitespaceSamples.push(env.replace(/\r?\n/g, newline)
          .replace(/^(NODE_MAJOR_VERSION:)[ \t]*/m, `$1${majorSpace}`)
          .replace(/^(NODE_MINOR_PATCH_VERSION:)[ \t]*/m, `$1${minorSpace}`));
      }
    }
  }
  // Evaluate the small field/replace subset used here, with Renovate's update
  // context. Arbitrary regex captures are available only during extraction.
  const render = (template, fields) => template.replace(/\{\{\{([\s\S]*?)}}}/g, (_match, expression) => {
    const tokens = expression.match(/\(|\)|'[^']*'|[A-Za-z]\w*/g);
    let index = 0;
    const value = () => {
      const token = tokens[index++];
      if (token === '(') {
        const result = replace();
        assert.equal(tokens[index++], ')');
        return result;
      }
      if (token.startsWith("'")) return token.slice(1, -1);
      assert.ok(Object.hasOwn(fields, token), `Unsupported template field: ${token}`);
      return fields[token];
    };
    const replace = () => {
      assert.equal(tokens[index++], 'replace');
      const pattern = value();
      const replacement = value();
      return value().replace(new RegExp(pattern, 'g'), replacement);
    };
    const result = tokens[0] === 'replace' ? replace() : value();
    assert.equal(index, tokens.length);
    return result;
  });
  for (const sample of [...whitespaceSamples, '#NODE_MAJOR_VERSION: 20\n#NODE_MINOR_PATCH_VERSION: 0.0\nNODE_MAJOR_VERSION: 26\nNODE_MINOR_PATCH_VERSION: 13.0\n', 'NODE_MAJOR_VERSION: 26\nNODE_MINOR_PATCH_VERSION: 13.0']) {
    const expression = new RegExp(manager.matchStrings[0], 'g');
    const matches = [...sample.matchAll(expression)];
    assert.equal(matches.length, 1);
    assert.equal(render(manager.currentValueTemplate, matches[0].groups), readNodeVersion(parseColonEnv(sample)).full);
    for (const [newMajor, newMinor, newPatch] of [['28', '0', '0'], ['26', '14', '0'], ['26', '13', '1']]) {
      const newValue = `${newMajor}.${newMinor}.${newPatch}`;
      const updated = sample.replace(expression, (replaceString) => render(manager.autoReplaceStringTemplate, { replaceString, newValue }));
      assert.equal(readNodeVersion(parseColonEnv(updated)).full, `${newMajor}.${newMinor}.${newPatch}`);
      const extracted = [...updated.matchAll(new RegExp(manager.matchStrings[0], 'g'))];
      assert.equal(extracted.length, 1);
      assert.equal(render(manager.currentValueTemplate, extracted[0].groups), newValue);
      const masked = (value) => value.replace(/^(NODE_(?:MAJOR|MINOR_PATCH)_VERSION:[ \t]*)[0-9]+(?:[.][0-9]+)*/gm, '$1<version>');
      assert.equal(masked(updated), masked(sample));
      if (whitespaceSamples.includes(sample)) {
        assert.ok(validateVersionChange(sample, updated).every((key) => key.startsWith('NODE_')));
      }
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
  assert.equal(nodeTestPaths.length, 3);
  assert.ok(nodeTestPaths.every((file) => nodeGeneratedPaths.includes(file)));
  assert.ok(nodeGeneratedPaths.every((file) => !file.startsWith('.github/workflows/')));
  for (const file of nodeGeneratedPaths) {
    const original = readFileSync(resolveRepoPath(file), 'utf8');
    assert.equal(syncNodeContent(original, file, current), original, file);
    const updated = syncNodeContent(original, file, next);
    assert.notEqual(updated, original, file);
    assert.equal(syncNodeContent(updated, file, next), updated, file);
    assert.equal(syncNodeContent(original.replaceAll('\n', '\r\n'), file, next), updated.replaceAll('\n', '\r\n'), file);
    if (nodeTestPaths.includes(file)) {
      const mask = (content) => content.replace(/(nodejs: 'v|node\/v)\d+\.\d+\.\d+/g, '$1<version>');
      assert.equal(mask(updated), mask(original), file);
      assert.ok(updated.includes(`v${next.full}`), file);
      assert.throws(() => syncNodeContent(mask(original), file, next), /Missing Node version fixture/);
    } else if (file.endsWith('/Dockerfile')) {
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
