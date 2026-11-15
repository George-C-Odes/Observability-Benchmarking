import assert from 'node:assert/strict';
import test from 'node:test';
import { reportClient, resolveReport, catalog } from './github-reports.mjs';

const repository = 'example/benchmark';
const sha = 'a'.repeat(40);
const run = (overrides = {}) => ({ id: 123, run_number: 3, head_sha: sha, head_branch: 'main', head_repository: { full_name: repository }, conclusion: 'success', ...overrides });
function resolver(runs, options = {}) {
  return resolveReport({ repository, token: 'synthetic-token', producer: 'go', scope: 'live',
    fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: runs }) }), ...options });
}

test('all catalog producers publish the latest failure instead of older green runs', async () => {
  for (const { id } of catalog) {
    const result = await resolver([run({ conclusion: 'failure', run_number: 4, id: 456 }), run()], { producer: id });
    assert.equal(result.run_id, '456');
    assert.equal(result.conclusion, 'failure');
  }
});

test('creation order wins over out-of-order completion and event metadata', async () => {
  const result = await resolver([run({ run_number: 2, id: 456 }), run()], { WR_ID: '456' });
  assert.equal(result.run_id, '123');
});

test('forks, missing source repositories, cancelled runs and wrong scopes are excluded', async () => {
  assert.equal((await resolver([run({ head_repository: null }), run({ head_repository: { full_name: 'fork/benchmark' } }),
    run({ conclusion: 'cancelled' }), run({ head_branch: 'feature' })])).status, 'no matching run');
  assert.equal((await resolver([run(), run({ head_branch: 'feature/a', id: 456 })], { scope: 'stage' })).run_id, '456');
});

test('bounded pagination finds eligible runs beyond the first 100', async () => {
  const pages = [];
  const result = await resolver([], { fetchImpl: async (url) => {
    pages.push(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => ({ workflow_runs: pages.length === 1 ? Array.from({ length: 100 }, () => run({ head_branch: 'feature' })) : [run()] }) };
  } });
  assert.equal(result.run_id, '123');
  assert.deepEqual(pages, ['1', '2']);
});

test('request boundary rejects alternate operations and malformed IDs before fetching', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Must not fetch'); };
  for (const repository of ['../repo', 'owner/..', 'owner/repo\n', 'owner/repo?x', 'owner/repo/extra', 'owner/%2e%2e']) {
    assert.throws(() => reportClient(repository, 'synthetic', { fetchImpl }), /Invalid/);
  }
  const client = reportClient('owner/repo', 'synthetic', { fetchImpl });
  for (const value of ['../123', '%2e%2e', '123?x', '123#x', '123\n', '0', '-1', '1/2']) {
    await assert.rejects(client.request('artifacts', value), /Invalid/);
  }
  await assert.rejects(client.request('https://evil.invalid', '123'), /Invalid/);
  await assert.rejects(client.request('runs', '../go'), /Invalid/);
  await assert.rejects(resolveReport({ repository, producer: 'go', scope: '../live', fetchImpl }), /Invalid/);
  assert.equal(calls, 0);
});

test('exact authorized URL, headers, redirect rejection, and bounded transient retries', async () => {
  const calls = [];
  const waits = [];
  const client = reportClient('owner/repo.name', 'synthetic-token', { wait: async (ms) => waits.push(ms), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return calls.length < 3 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ workflow_runs: [] }) };
  } });
  await client.request('runs', 'nextjs');
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [1000, 2000]);
  for (const { url, options } of calls) {
    assert.equal(url, 'https://api.github.com/repos/owner/repo.name/actions/workflows/nextjs_dash_quality.yml/runs?per_page=100&page=1&status=completed');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!url.includes('synthetic-token'));
  }
});

test('redirects, authentication failures and malformed responses remain errors', async () => {
  for (const status of [302, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(resolver([], { fetchImpl: async () => { calls++; return { ok: false, status }; } }), /lookup failed/);
    assert.equal(calls, 1);
  }
  await assert.rejects(resolver([], { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /Malformed/);
});

test('malicious response identifiers never reach subsequent download operations', async () => {
  for (const malicious of ['123\nrun_id=999', '../1', '1?x', '%2e%2e']) {
    await assert.rejects(resolver([run({ id: malicious })]), /Malformed/);
    await assert.rejects(resolver([run({ head_sha: malicious })]), /Malformed/);
  }
});
