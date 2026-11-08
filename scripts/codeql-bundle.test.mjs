import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codeqlActionSha, resolveCodeqlBundle } from './codeql-bundle.mjs';

const sha = '33d7b85da1a04171e211befe2c739303b9a4c066';
const digest = `sha256:${'a'.repeat(64)}`;
const defaults = (version = '2.27.4') => ({ cliVersion: version, bundleVersion: `codeql-bundle-v${version}` });
const asset = (language = 'python') => ({ name: `codeql-bundle-${language}-linux64.tar.zst`, id: 123, digest });
const release = (assets = [asset()], version = '2.27.4') => ({ tag_name: `codeql-bundle-v${version}`, assets });
const response = (body) => ({ ok: true, json: async () => body });
const noDelay = { wait: async () => {}, warn: () => {} };

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
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => ({ ok: false, status: 504 }), noDelay), /CodeQL defaults \(contents API\) failed: HTTP 504/);
  for (const message of ['network failure', 'redirect rejected']) {
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => { throw new Error(message); }), new RegExp(message));
  }
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })), /bad JSON/);
});

test('transient HTTP and transport failures retry the exact request and recover', async () => {
  const failures = [
    ...[408, 429, 500, 502, 503, 504].map((status) => ({ ok: false, status })),
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
    Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
  ];
  for (const failure of failures) {
    const calls = [];
    const delays = [];
    await resolveCodeqlBundle(sha, 'python', async (...args) => {
      calls.push(args);
      if (calls.length <= 2) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      return response(calls.length === 3 ? defaults() : release());
    }, { wait: async (delay) => { delays.push(delay); }, warn: () => {} });
    assert.equal(calls.length, 4);
    assert.equal(calls[0][0], calls[1][0]);
    assert.equal(calls[1][0], calls[2][0]);
    assert.notEqual(calls[0][1].signal, calls[1][1].signal);
    assert.deepEqual(delays, [2000, 4000]);
  }
});

test('exhausted raw requests fall back to the same pinned file through the contents API', async () => {
  const calls = [];
  const result = await resolveCodeqlBundle(sha, 'go', async (...args) => {
    calls.push(args);
    if (calls.length <= 3) return { ok: false, status: 504 };
    return response(calls.length === 4 ? defaults() : release([asset('go')]));
  }, noDelay);
  assert.equal(calls.length, 5);
  assert.equal(calls[3][0], `https://api.github.com/repos/github/codeql-action/contents/src/defaults.json?ref=${sha}`);
  assert.deepEqual(calls[3][1].headers, { Accept: 'application/vnd.github.raw+json' });
  assert.equal(calls[3][1].redirect, 'error');
  assert.match(result.api_url, /\/assets\/123$/);
});

test('release metadata retries independently after defaults succeed', async () => {
  const calls = [];
  await resolveCodeqlBundle(sha, 'python', async (url) => {
    calls.push(url);
    if (calls.length === 1) return response(defaults());
    if (calls.length < 4) return { ok: false, status: 504 };
    return response(release());
  }, noDelay);
  assert.equal(calls.length, 4);
  assert.equal(calls[1], calls[2]);
  assert.equal(calls[2], calls[3]);
});

test('untrusted fallback metadata is validated before any release lookup', async () => {
  const calls = [];
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async (url) => {
    calls.push(url);
    return calls.length <= 3 ? { ok: false, status: 504 } : response(defaults('2.27.4/../../other'));
  }, noDelay), /Unexpected CodeQL bundle version metadata/);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => !url.includes('/releases/')));
});

test('persistent release outages stop after three attempts without changing the selected tag', async () => {
  const calls = [];
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async (url) => {
    calls.push(url);
    return calls.length === 1 ? response(defaults()) : { ok: false, status: 504 };
  }, noDelay), /CodeQL bundle release failed: HTTP 504/);
  assert.equal(calls.length, 4);
  assert.equal(calls[1], calls[2]);
  assert.equal(calls[2], calls[3]);
});

test('persistent metadata outages stop after bounded attempts with no release or download request', async () => {
  const calls = [];
  const delays = [];
  await assert.rejects(resolveCodeqlBundle(sha, 'python', async (url) => {
    calls.push(url);
    return { ok: false, status: 504 };
  }, { wait: async (delay) => { delays.push(delay); }, warn: () => {} }), /contents API.*HTTP 504/);
  assert.equal(calls.length, 6);
  assert.deepEqual(delays, [2000, 4000, 2000, 4000]);
  assert.ok(calls.every((url) => !url.includes('/releases/')));
});

test('permanent HTTP failures and malformed JSON do not retry or select another endpoint', async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => { calls += 1; return { ok: false, status }; }, noDelay), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
  }
  for (const failure of [new SyntaxError('bad JSON'), new TypeError('redirect rejected')]) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => {
      calls += 1;
      return { ok: true, json: async () => { throw failure; } };
    }, noDelay));
    assert.equal(calls, 1);
  }
});

test('all three wrapper pins must agree', () => {
  const wrapper = ['init', 'analyze', 'upload-sarif'].map((phase) => `uses: github/codeql-action/${phase}@${sha}`).join('\n');
  assert.equal(codeqlActionSha(wrapper), sha);
  assert.throws(() => codeqlActionSha(wrapper.replace(`init@${sha}`, `init@${'a'.repeat(40)}`)));
  assert.throws(() => codeqlActionSha(''));
});

test('the checked-in lock resolves all matrix languages without any network request', async () => {
  const lock = JSON.parse(readFileSync(new URL('../.github/actions/codeql-action/bundle-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.actionSha, sha);
  for (const language of ['java-kotlin', 'python', 'go', 'javascript-typescript']) {
    let calls = 0;
    const result = await resolveCodeqlBundle(sha, language, async () => { calls += 1; throw new Error('network unavailable'); }, { lock });
    assert.equal(calls, 0);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.match(result.api_url, /^https:\/\/api.github.com\/repos\/github\/codeql-action\/releases\/assets\/[0-9]+$/);
  }
});

test('an upgraded action ignores an old lock and resolves its own version', async () => {
  let calls = 0;
  const lock = { actionSha: 'a'.repeat(40), defaults: defaults('1.0.0'), release: release([], '1.0.0') };
  const result = await resolveCodeqlBundle(sha, 'python', async () => response(++calls === 1 ? defaults('2.27.5') : release([asset()], '2.27.5')), { lock });
  assert.equal(calls, 2);
  assert.match(result.download_url, /codeql-bundle-v2\.27\.5/);
});

test('a malformed matching lock fails closed without network fallback', async () => {
  for (const lock of [{ actionSha: sha }, { actionSha: sha, defaults: defaults('../other') }, { actionSha: sha, defaults: defaults(), release: release([{ ...asset(), id: '../other' }]) }]) {
    let calls = 0;
    await assert.rejects(resolveCodeqlBundle(sha, 'python', async () => { calls += 1; }, { lock }));
    assert.equal(calls, 0);
  }
});

test('the actual CLI resolves each locked language and exits nonzero for invalid input', (t) => {
  const cli = fileURLToPath(new URL('./codeql-bundle.mjs', import.meta.url));
  const wrapper = readFileSync(new URL('../.github/actions/codeql-action/action.yml', import.meta.url), 'utf8');
  const lock = JSON.parse(readFileSync(new URL('../.github/actions/codeql-action/bundle-lock.json', import.meta.url), 'utf8'));
  if (codeqlActionSha(wrapper) !== lock.actionSha) {
    t.skip('Action upgraded: live lookup is covered separately; CLI has no matching offline lock.');
    return;
  }
  for (const language of ['java-kotlin', 'python', 'go', 'javascript-typescript']) {
    const result = spawnSync(process.execPath, [cli, language], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^download_url=https:\/\/github.com\/github\/codeql-action\//);
    assert.match(result.stdout, /\nsha256=[a-f0-9]{64}\n$/);
  }
  const invalid = spawnSync(process.execPath, [cli, '../python'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
});
