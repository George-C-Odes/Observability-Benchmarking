import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveReleaseAsset } from './github-release-asset.mjs';

test('unknown tool selectors cannot choose a repository or make a request', async () => {
  for (const tool of [undefined, '', '__proto__', 'toString', '../qodana', 'https://evil.example/', 'JetBrains/qodana-cli']) {
    let calls = 0;
    await assert.rejects(resolveReleaseAsset(tool, '2026.2.3', async () => { calls += 1; }), /Unsupported release asset tool/);
    assert.equal(calls, 0);
  }
});

const profiles = [
  { script: 'qodana-cli-asset.mjs', version: '2026.2.3', label: 'Qodana CLI', repository: 'JetBrains/qodana-cli', name: 'qodana_linux_x86_64.tar.gz' },
  { script: 'golangci-lint-asset.mjs', version: '2.15.0', label: 'golangci-lint', repository: 'golangci/golangci-lint', name: 'golangci-lint-2.15.0-linux-amd64.tar.gz' },
];

for (const profile of profiles) {
  const script = fileURLToPath(new URL(profile.script, import.meta.url));
  // Exercise the actual CLI with a synthetic response and no network access.
  const preload = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
  const run = (args, source) => spawnSync(process.execPath, ['--import', preload(source), ...args], { encoding: 'utf8', timeout: 10_000 });
  const noFetch = "globalThis.fetch = () => { throw new Error('unexpected request'); };";

  test(`${profile.script} prints only the resolved URL on success`, () => {
    const body = { tag_name: `v${profile.version}`, assets: [{ name: profile.name, id: 123 }] };
    const result = run([script, profile.version], `globalThis.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify(body)}) });`);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `https://api.github.com/repos/${profile.repository}/releases/assets/123\n`);
    assert.equal(result.stderr, '');
  });

  test(`${profile.script} rejects missing and malicious versions with a nonzero exit`, () => {
    for (const args of [[], ['../other']]) {
      const result = run([script, ...args], noFetch);
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, `Invalid ${profile.label} version\n`);
    }
  });

  test(`${profile.script} propagates lookup failures to the CLI exit status`, () => {
    const result = run([script, profile.version], 'globalThis.fetch = async () => ({ ok: false, status: 503 });');
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /release lookup failed: HTTP 503/);
  });

  test(`${profile.script} can be imported without running the CLI`, () => {
    const moduleUrl = new URL(profile.script, import.meta.url).href;
    const result = run(['--input-type=module', '--eval', `await import(${JSON.stringify(moduleUrl)});`], noFetch);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });
}
