import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGolangciLintAsset } from './golangci-lint-asset.mjs';
import { assertReleaseMetadataRequest } from './test-helpers.mjs';

const asset = (id, version = '2.15.0') => ({ name: `golangci-lint-${version}-linux-amd64.tar.gz`, id });
const release = (assets, tag_name = 'v2.15.0') => ({ tag_name, assets });
const response = (body) => ({ ok: true, json: async () => body });

test('version bumps resolve their own archive within the fixed repository', async () => {
  for (const [version, id] of [['2.15.0', 647132535], ['2.16.0', 123456789]]) {
    const calls = [];
    const url = await resolveGolangciLintAsset(version, async (...args) => {
      calls.push(args);
      return response(release([
        asset(1, '2.14.0'),
        { ...asset(id, version), url: 'https://evil.example/', browser_download_url: 'https://evil.example/' },
      ], `v${version}`));
    });
    assert.equal(url, `https://api.github.com/repos/golangci/golangci-lint/releases/assets/${id}`);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `https://api.github.com/repos/golangci/golangci-lint/releases/tags/v${version}`);
    assertReleaseMetadataRequest(calls[0][1]);
  }
});

test('malformed versions cause zero requests', async () => {
  for (const version of [undefined, '', '../2.15.0', '%2e%2e', '2.15.0?x=1', '2.15.0#x', '2.15.0/other', '2.15.0\\other', '2.15.0\n', '2.15.0\r', 'https://evil.example/']) {
    let calls = 0;
    await assert.rejects(resolveGolangciLintAsset(version, async () => { calls += 1; }), /Invalid golangci-lint version/);
    assert.equal(calls, 0);
  }
});

test('unsafe metadata IDs never produce a subsequent download URL', async () => {
  for (const id of ['../other', '123?x=1', '123\n', '123', -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
    let calls = 0;
    await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => {
      calls += 1;
      return response(release([asset(id)]));
    }), /invalid golangci-lint/);
    assert.equal(calls, 1);
  }
});

test('wrong releases, missing assets and ambiguous assets fail closed', async () => {
  for (const body of [null, {}, release(null), release([]), release([asset(1)], 'v2.14.0'), release([asset(1), asset(2)]), release([asset(1, '2.14.0')]), release([{ name: 'golangci-lint-2.15.0-linux-arm64.tar.gz', id: 1 }])]) {
    await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => response(body)));
  }
});

test('HTTP, redirect, network and JSON errors remain failures', async () => {
  await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => ({ ok: false, status: 504 })), /HTTP 504/);
  await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => { throw new TypeError('redirect rejected'); }), /redirect rejected/);
  await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => { throw new Error('network failure'); }), /network failure/);
  await assert.rejects(resolveGolangciLintAsset('2.15.0', async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } })), /invalid JSON/);
});
