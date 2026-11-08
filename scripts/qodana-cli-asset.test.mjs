import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveQodanaAsset } from './qodana-cli-asset.mjs';

const asset = (id) => ({ name: 'qodana_linux_x86_64.tar.gz', id });
const release = (assets, tag_name = 'v2026.2.3') => ({ tag_name, assets });
const response = (body) => ({ ok: true, json: async () => body });

test('each version resolves its own asset with fixed request scope and no credentials', async () => {
  for (const [version, id] of [['2026.2.2', 585558698], ['2026.2.3', 689188800]]) {
    const calls = [];
    const url = await resolveQodanaAsset(version, async (...args) => {
      calls.push(args);
      // Ignore URLs supplied by metadata, even when they point elsewhere.
      return response(release([{ ...asset(id), url: 'https://evil.example/', browser_download_url: 'https://evil.example/' }], `v${version}`));
    });
    assert.equal(url, `https://api.github.com/repos/JetBrains/qodana-cli/releases/assets/${id}`);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `https://api.github.com/repos/JetBrains/qodana-cli/releases/tags/v${version}`);
    assert.equal(calls[0][1].method, 'GET');
    assert.equal(calls[0][1].redirect, 'error');
    assert.deepEqual(calls[0][1].headers, { Accept: 'application/vnd.github+json' });
    assert.ok(calls[0][1].signal instanceof AbortSignal);
  }
});

test('malicious or malformed versions cause zero requests', async () => {
  for (const version of [undefined, '', '../2026.2.3', '%2e%2e', '2026.2.3?x=1', '2026.2.3#x', '2026.2.3/other', '2026.2.3\\other', '2026.2.3\n', '2026.2.3\r', 'https://evil.example/']) {
    let calls = 0;
    await assert.rejects(resolveQodanaAsset(version, async () => { calls += 1; }), /Invalid Qodana CLI version/);
    assert.equal(calls, 0);
  }
});

test('unsafe response IDs never produce a subsequent download URL', async () => {
  for (const id of ['../other', '689188800?x=1', '689188800\n', '689188800', -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
    let calls = 0;
    await assert.rejects(resolveQodanaAsset('2026.2.3', async () => {
      calls += 1;
      return response(release([asset(id)]));
    }), /invalid Qodana/);
    assert.equal(calls, 1);
  }
});

test('wrong releases, missing assets and ambiguous assets fail closed', async () => {
  for (const body of [null, {}, release(null), release([]), release([asset(1)], 'v2026.2.2'), release([asset(1), asset(2)]), release([{ name: 'qodana_linux_arm64.tar.gz', id: 1 }])]) {
    await assert.rejects(resolveQodanaAsset('2026.2.3', async () => response(body)));
  }
});

test('HTTP, redirect, network and JSON failures remain failures', async () => {
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => ({ ok: false, status: 504 })), /HTTP 504/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => { throw new TypeError('redirect rejected'); }), /redirect rejected/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => { throw new Error('network failure'); }), /network failure/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } })), /invalid JSON/);
});
