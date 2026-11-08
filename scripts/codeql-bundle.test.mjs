import assert from 'node:assert/strict';
import test from 'node:test';
import { codeqlActionSha, resolveCodeqlBundle } from './codeql-bundle.mjs';

const sha = '33d7b85da1a04171e211befe2c739303b9a4c066';
const digest = `sha256:${'a'.repeat(64)}`;
const defaults = (version = '2.27.4') => ({ cliVersion: version, bundleVersion: `codeql-bundle-v${version}` });
const asset = (language = 'python') => ({ name: `codeql-bundle-${language}-linux64.tar.zst`, id: 123, digest });
const release = (assets = [asset()], version = '2.27.4') => ({ tag_name: `codeql-bundle-v${version}`, assets });
const response = (body) => ({ ok: true, json: async () => body });

test('all matrix languages follow the pinned action version and ignore metadata URLs', async () => {
  for (const version of ['2.27.4', '2.27.5']) {
    for (const [language, bundleLanguage] of [['java-kotlin', 'java'], ['python', 'python'], ['go', 'go'], ['javascript-typescript', 'javascript']]) {
      const calls = [];
      const result = await resolveCodeqlBundle(sha, language, async (...args) => {
        calls.push(args);
        return response(calls.length === 1 ? defaults(version) : release([{ ...asset(bundleLanguage), url: 'https://evil.example/', browser_download_url: 'https://evil.example/' }], version));
      });
      assert.deepEqual(calls.map(([url]) => url), [
        `https://raw.githubusercontent.com/github/codeql-action/${sha}/src/defaults.json`,
        `https://api.github.com/repos/github/codeql-action/releases/tags/codeql-bundle-v${version}`,
      ]);
      for (const [, options] of calls) {
        assert.equal(options.method, 'GET');
        assert.equal(options.redirect, 'error');
        assert.deepEqual(options.headers, { Accept: 'application/json' });
        assert.ok(options.signal instanceof AbortSignal);
      }
      assert.deepEqual(result, {
        download_url: `https://github.com/github/codeql-action/releases/download/codeql-bundle-v${version}/codeql-bundle-${bundleLanguage}-linux64.tar.zst`,
        api_url: 'https://api.github.com/repos/github/codeql-action/releases/assets/123',
        sha256: 'a'.repeat(64),
      });
    }
  }
});

test('invalid action refs and languages cause zero requests', async () => {
  for (const [ref, language] of [[`${sha}\n`, 'python'], ['../main', 'python'], ['%2e%2e', 'go'], ['main?x=1', 'go'], [sha, '../python'], [sha, 'python\n'], [sha, 'python?x=1'], [sha, 'https://evil.example/']]) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(ref, language, async () => { calls += 1; }));
    assert.equal(calls, 0);
  }
});

test('malicious response-derived versions cannot reach a second request', async () => {
  for (const body of [null, {}, defaults('../other'), defaults('%2e%2e'), defaults('2.27.4?x=1'), defaults('2.27.4\n'), { ...defaults(), bundleVersion: 'other/tag' }]) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => { calls += 1; return response(body); }));
    assert.equal(calls, 1);
  }
});

test('invalid assets, digests and release tags cannot produce a download URL', async () => {
  const badAssets = [
    ...['../other', '123?x=1', '123\n', '123', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((id) => ({ ...asset(), id })),
    ...[null, '', 'sha256:bad', `${digest}\n`].map((digest) => ({ ...asset(), digest })),
  ];
  const bodies = [null, {}, release(null), release([]), release([asset(), asset()]), release([asset('go')]), release([asset()], '2.27.3'), ...badAssets.map((entry) => release([entry]))];
  for (const body of bodies) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => response(++calls === 1 ? defaults() : body)));
    assert.equal(calls, 2);
  }
});

test('HTTP, network, redirect and JSON failures remain failures', async () => {
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => ({ ok: false, status: 504 })), /HTTP 504/);
  for (const message of ['network failure', 'redirect rejected']) {
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => { throw new Error(message); }), new RegExp(message));
  }
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })), /bad JSON/);
});

test('all three wrapper pins must agree', () => {
  const wrapper = ['init', 'analyze', 'upload-sarif'].map((phase) => `uses: github/codeql-action/${phase}@${sha}`).join('\n');
  assert.equal(codeqlActionSha(wrapper), sha);
  assert.throws(() => codeqlActionSha(wrapper.replace(`init@${sha}`, `init@${'a'.repeat(40)}`)));
  assert.throws(() => codeqlActionSha(''));
});
