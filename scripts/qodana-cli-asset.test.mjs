import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveQodanaAsset } from './qodana-cli-asset.mjs';
import { assertReleaseMetadataRequest } from './test-helpers.mjs';

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
    assertReleaseMetadataRequest(calls[0][1]);
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
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => ({ ok: false, status: 504 }), { wait: async () => {}, warn: () => {} }), /HTTP 504/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => { throw new TypeError('redirect rejected'); }), /redirect rejected/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => { throw new Error('network failure'); }), /network failure/);
  await assert.rejects(resolveQodanaAsset('2026.2.3', async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } })), /invalid JSON/);
});

const lock = JSON.parse(readFileSync(new URL('../.github/qodana-cli-lock.json', import.meta.url), 'utf8'));

test('matching version and checksum resolve the locked asset with zero network requests', async () => {
  let calls = 0;
  const url = await resolveQodanaAsset(lock.version, async () => { calls += 1; throw new Error('network unavailable'); }, { lock, expectedSha256: lock.sha256 });
  assert.equal(calls, 0);
  assert.equal(url, `https://api.github.com/repos/JetBrains/qodana-cli/releases/assets/${lock.assetId}`);
});

test('a version bump ignores the old asset ID and resolves the requested release', async () => {
  let calls = 0;
  const url = await resolveQodanaAsset('2026.2.4', async (url) => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/repos/JetBrains/qodana-cli/releases/tags/v2026.2.4');
    return response(release([asset(123)], 'v2026.2.4'));
  }, { lock, expectedSha256: 'a'.repeat(64) });
  assert.equal(calls, 1);
  assert.equal(url, 'https://api.github.com/repos/JetBrains/qodana-cli/releases/assets/123');
});

test('invalid lock fields or mismatched checksums fail before any request', async () => {
  for (const options of [
    { lock },
    { lock, expectedSha256: 'a'.repeat(64) },
    { lock, expectedSha256: `${lock.sha256}\n` },
    ...[{ assetId: '../other' }, { assetId: 0 }, { repository: 'other/repo' }, { assetName: 'other.tar.gz' }].map((change) => ({ lock: { ...lock, ...change }, expectedSha256: lock.sha256 })),
  ]) {
    let calls = 0;
    await assert.rejects(resolveQodanaAsset(lock.version, async () => { calls += 1; }, options));
    assert.equal(calls, 0);
  }
});

test('the production CLI uses the checked-in lock with network disabled', () => {
  const preload = `data:text/javascript,${encodeURIComponent("globalThis.fetch = () => { throw new Error('unexpected network request'); };")}`;
  const cli = fileURLToPath(new URL('./qodana-cli-asset.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--import', preload, cli, lock.version, lock.sha256], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `https://api.github.com/repos/JetBrains/qodana-cli/releases/assets/${lock.assetId}\n`);
  const invalid = spawnSync(process.execPath, ['--import', preload, cli, lock.version, 'a'.repeat(64)], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
});
