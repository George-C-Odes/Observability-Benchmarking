import assert from 'node:assert/strict';
import test from 'node:test';
import { reportClient, resolveReport, collectionPlan } from './github-reports.mjs';

const repository = 'example/benchmark';
const sha = 'a'.repeat(40);
const run = (overrides = {}) => ({ id: 123, run_number: 3, head_sha: sha, head_branch: 'main', head_repository: { full_name: repository }, conclusion: 'success', ...overrides });
function resolver(runs, options = {}) {
  return resolveReport({ repository, token: 'synthetic-token', producer: 'go', scope: 'live',
    fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: runs }) }), ...options });
}

test('all catalog producers publish the latest failure instead of older green runs', async () => {
  for (const entry of collectionPlan) {
    const runs = [run({ conclusion: 'failure', run_number: 4, id: 456 }), run()];
    const result = await resolver(runs, { producer: entry.producer, report: entry.report,
      fetchImpl: async (url) => {
        const body = url.includes('/jobs?')
          ? { jobs: entry.reports.map((report) => ({ name: report.job, conclusion: 'failure', steps: [] })) }
          : { workflow_runs: runs };
        return { ok: true, json: async () => body };
      } });
    assert.equal(result.run_id, '456');
    assert.equal(result.conclusion, 'failure');
  }
});

test('creation order wins over out-of-order completion and event metadata', async () => {
  const result = await resolver([run({ run_number: 2, id: 456 }), run()], { WR_ID: '456' });
  assert.equal(result.run_id, '123');
});

test('artifact timestamps come from exact report names in the selected run', async () => {
  const calls = [];
  const result = await resolver([], { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/workflows/')) return { ok: true, json: async () => ({ workflow_runs: [run(), run({ id: 456, run_number: 4 })] }) };
    const page = new URL(url).searchParams.get('page');
    const enhanced = { name: 'quality-report-go', expired: false, created_at: '2026-11-20T08:12:34Z' };
    const archives = page === '1' ? [enhanced, ...Array.from({ length: 99 }, () => ({ name: 'unrelated', expired: false }))] : [
      { name: 'quality-report-go-simple', expired: false, created_at: '2026-11-20T08:13:55Z' },
      { name: 'quality-report-go-simple', expired: true, created_at: '2026-11-19T08:13:55Z' },
    ];
    return { ok: true, json: async () => ({ artifacts: archives }) };
  } });
  assert.equal(result.run_id, '456');
  assert.deepEqual(result.artifact_created_at, {
    'quality-report-go': '2026-11-20T08:12:34Z',
    'quality-report-go-simple': '2026-11-20T08:13:55Z',
  });
  assert.equal(calls.length, 3);
  for (const [index, { url, options }] of calls.slice(1).entries()) {
    assert.equal(url, `https://api.github.com/repos/${repository}/actions/runs/456/artifacts?per_page=100&page=${index + 1}`);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  }
});

test('a failed timestamp lookup preserves the selected report run', async () => {
  const result = await resolver([], { fetchImpl: async (url) => url.includes('/artifacts?')
    ? { ok: false, status: 403 }
    : { ok: true, json: async () => ({ workflow_runs: [run()] }) } });
  assert.equal(result.run_id, '123');
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.artifact_created_at, {});
});

test('forks, missing source repositories, cancelled runs and wrong scopes are excluded', async () => {
  assert.equal((await resolver([run({ head_repository: null }), run({ head_repository: { full_name: 'fork/benchmark' } }),
    run({ conclusion: 'cancelled' }), run({ head_branch: 'feature' })])).status, 'no matching run');
  assert.equal((await resolver([run(), run({ head_branch: 'feature/a', id: 456 })], { scope: 'stage' })).run_id, '456');
});

test('bounded pagination finds eligible runs beyond the first 100', async () => {
  const pages = [];
  const result = await resolver([], { fetchImpl: async (url) => {
    if (url.includes('/artifacts?')) return { ok: true, json: async () => ({ artifacts: [] }) };
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
    assert.equal(url, 'https://api.github.com/repos/owner/repo.name/actions/workflows/sonar.yml/runs?per_page=100&page=1&status=completed');
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
    for (const overrides of [{ id: malicious }, { head_sha: malicious }]) {
      let requests = 0;
      await assert.rejects(resolver([], { fetchImpl: async () => {
        requests++;
        return { ok: true, json: async () => ({ workflow_runs: [run(overrides)] }) };
      } }), /Malformed/);
      assert.equal(requests, 1);
    }
  }
});


test('control characters in response branches never select a report', async () => {
  for (const character of ['\r', '\n', String.fromCodePoint(0)]) {
    const result = await resolver([run({ head_branch: `feature${character}branch` })], { scope: 'stage' });
    assert.equal(result.status, 'no matching run');
  }
});

function qodanaJob(scope, skipped = false, overrides = {}) {
  return { name: `Qodana (${scope})`, conclusion: 'success', steps: [
    { name: 'Record unaffected scope', conclusion: skipped ? 'success' : 'skipped' },
    { name: 'Qodana Scan', conclusion: skipped ? 'skipped' : 'success' },
  ], ...overrides };
}

function scopedResolver(runs, jobs, options = {}) {
  const calls = [];
  const fetchImpl = async (url, request) => {
    calls.push({ url, request });
    const match = /\/runs\/([0-9]+)\/jobs\?/.exec(url);
    return { ok: true, json: async () => match ? { jobs: jobs[match[1]] } : { workflow_runs: runs } };
  };
  return { calls, resolve: (artifact) => resolveReport({ repository, token: 'synthetic-token',
    producer: 'qodana', scope: 'stage', report: artifact, fetchImpl, ...options }) };
}

test('Qodana collection plan has separate source/download contracts without changing report URLs', () => {
  const plans = collectionPlan.filter((entry) => entry.producer === 'qodana');
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((entry) => entry.id), ['qodana-services-java', 'qodana-orchestrator']);
  for (const entry of plans) {
    assert.equal(entry.reports.length, 1);
    assert.equal(entry.reports[0].artifact, entry.report);
  }
});

test('documentation-only and one-scope PRs retain each Qodana report from its latest attempted scan', async () => {
  const runs = [run({ id: 4, run_number: 4, head_branch: 'docs' }),
    run({ id: 3, run_number: 3, head_branch: 'orchestrator-only' }),
    run({ id: 2, run_number: 2, head_branch: 'services-only' }),
    run({ id: 1, run_number: 1, head_branch: 'all-scopes' })];
  const jobs = {
    4: [qodanaJob('services-java', true), qodanaJob('orchestrator', true)],
    3: [qodanaJob('services-java', true), qodanaJob('orchestrator')],
    2: [qodanaJob('services-java'), qodanaJob('orchestrator', true)],
    1: [qodanaJob('services-java'), qodanaJob('orchestrator')],
  };
  const { resolve, calls } = scopedResolver(runs, jobs);
  assert.equal((await resolve('qodana-report-services-java')).run_id, '2');
  assert.equal((await resolve('qodana-report-orchestrator')).run_id, '3');
  for (const { url, request } of calls.filter((call) => call.url.includes('/jobs?'))) {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/example\/benchmark\/actions\/runs\/[234]\/jobs\?per_page=100&page=1&filter=latest$/);
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-token');
    assert.ok(request.signal instanceof AbortSignal);
  }
});

test('scan, startup and missing-evidence failures never fall back to older green Qodana reports', async () => {
  const runs = [run({ id: 4, run_number: 4, head_branch: 'feature', conclusion: 'failure' }),
    run({ id: 1, run_number: 1, head_branch: 'older' })];
  for (const steps of [
    [{ name: 'Qodana Scan', conclusion: 'failure' }],
    [{ name: 'Checkout', conclusion: 'failure' }, { name: 'Qodana Scan', conclusion: 'skipped' }],
    [{ name: 'Record unaffected scope', conclusion: 'success' }, { name: 'Qodana Scan', conclusion: 'failure' }],
    [],
  ]) {
    const { resolve, calls } = scopedResolver(runs, { 4: [qodanaJob('services-java', false, { conclusion: 'failure', steps })] });
    const selected = await resolve('qodana-report-services-java');
    assert.equal(selected.run_id, '4');
    assert.equal(selected.conclusion, 'failure');
    assert.equal(selected.status, 'resolved');
    assert.equal(calls.length, 3);
  }
  const { resolve } = scopedResolver(runs, { 4: [] });
  assert.equal((await resolve('qodana-report-orchestrator')).status, 'scope evidence unavailable');
});

test('legacy Qodana jobs remain eligible and job pagination is bounded', async () => {
  const runs = [run({ head_branch: 'feature' })];
  const legacy = scopedResolver(runs, { 123: [{ name: 'Qodana (orchestrator)', conclusion: 'success', steps: [{ name: 'Qodana Scan', conclusion: 'success' }] }] });
  assert.equal((await legacy.resolve('qodana-report-orchestrator')).run_id, '123');
  const pages = [];
  const selected = await scopedResolver(runs, {}, { fetchImpl: async (url) => {
    if (!url.includes('/jobs?')) return { ok: true, json: async () => ({ workflow_runs: runs }) };
    const page = new URL(url).searchParams.get('page');
    pages.push(page);
    return { ok: true, json: async () => ({ jobs: page === '1' ? Array.from({ length: 100 }, () => ({ name: 'other job' })) : [qodanaJob('orchestrator')] }) };
  } }).resolve('qodana-report-orchestrator');
  assert.equal(selected.run_id, '123');
  assert.deepEqual(pages, ['1', '2']);
});

test('invalid reports, run IDs and alternate job routes cannot issue requests', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('Must not fetch'); };
  for (const report of [undefined, '../qodana-report-orchestrator', 'qodana-report-orchestrator\n', 'unknown']) {
    await assert.rejects(resolveReport({ repository, producer: 'qodana', scope: 'stage', report, fetchImpl }), /Invalid/);
  }
  const client = reportClient(repository, 'synthetic-token', { fetchImpl });
  for (const id of ['../123', '123\n', '123?x', '%2e%2e', '1/jobs']) await assert.rejects(client.request('jobs', id), /Invalid/);
  assert.equal(calls, 0);
  for (const id of ['../123', '123\n', '123?x', '%2e%2e']) {
    let requests = 0;
    await assert.rejects(resolveReport({ repository, producer: 'qodana', scope: 'stage', report: 'qodana-report-orchestrator',
      fetchImpl: async () => { requests++; return { ok: true, json: async () => ({ workflow_runs: [run({ id, head_branch: 'feature' })] }) }; } }), /Malformed/);
    assert.equal(requests, 1, 'Invalid response-derived IDs must never reach a jobs request');
  }
});

test('total lookup deadline bounds runs, jobs, retries and per-attempt requests', async () => {
  let time = 0;
  const requests = [];
  const client = reportClient(repository, 'synthetic-token', { now: () => time, fetchImpl: async (url, request) => {
    requests.push({ url, request });
    time = 240_000;
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  } });
  await client.request('runs', 'qodana');
  await assert.rejects(client.request('jobs', '123'), /lookup failed/);
  assert.equal(requests.length, 1);
});
