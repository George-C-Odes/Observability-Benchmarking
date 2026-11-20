import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const catalog = JSON.parse(readFileSync(new URL('./report-catalog.json', import.meta.url), 'utf8'));
// Conditionally scanned reports need independent run provenance and downloads.
export const collectionPlan = catalog.flatMap((producer) => producer.reports.some((report) => report.job)
  ? producer.reports.map((report) => ({ ...producer, id: `${producer.id}-${report.path}`, producer: producer.id,
    report: report.artifact, reports: [report] }))
  : [{ ...producer, producer: producer.id }]);
const transient = new Set([408, 429, 500, 502, 503, 504]);
const identifier = (value) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.trim() === value;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && value.trim() === value;

function repositoryParts(repository) {
  if (typeof repository !== 'string' || repository.trim() !== repository) throw new Error('Invalid repository');
  const parts = repository.split('/');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')) throw new Error('Invalid repository');
  return parts;
}

function reportRoute(operation, value) {
  if (operation === 'runs') {
    const producer = catalog.find((entry) => entry.id === value);
    if (!producer) throw new Error('Invalid report producer');
    return `/actions/workflows/${encodeURIComponent(producer.workflow)}/runs`;
  }
  if (['artifacts', 'jobs'].includes(operation) && identifier(String(value))) return `/actions/runs/${encodeURIComponent(String(value))}/${operation}`;
  throw new Error('Invalid report operation');
}

// Request-safety gate: repository/token come from the trusted Actions launcher;
// producer/scope are fixed catalog operations. API run IDs/SHAs remain untrusted.
// Only GET list-runs/list-artifacts/list-jobs within this repository on api.github.com are
// authorized. Artifact lookups use the selected run's validated numeric ID and do not
// follow URLs in the response. Components are encoded once; credentials stay in headers,
// redirects are rejected, and every attempt has a 20-second deadline.
export function reportClient(repository, token, { fetchImpl = fetch, wait = sleep, now = Date.now } = {}) {
  const parts = repositoryParts(repository);
  const prefix = `https://api.github.com/repos/${parts.map(encodeURIComponent).join('/')}`;
  const deadline = now() + 240_000;
  function requestSignal() {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error('GitHub report lookup budget exhausted');
    return AbortSignal.timeout(Math.min(20_000, remaining));
  }
  async function request(operation, value, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 5) throw new Error('Invalid page');
    const route = reportRoute(operation, value);
    const query = new URLSearchParams({ per_page: '100', page: String(page) });
    if (operation === 'runs') query.set('status', 'completed');
    if (operation === 'jobs') query.set('filter', 'latest');
    const url = `${prefix}${route}?${query}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetchImpl(url, {
          method: 'GET', redirect: 'error', signal: requestSignal(),
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
        });
        if (!response.ok) {
          const error = new Error(`GitHub report API returned ${response.status}`);
          error.retryable = transient.has(response.status);
          throw error;
        }
        return await response.json();
      } catch (error) {
        const retryable = error.retryable || ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name);
        if (attempt === 3 || !retryable) throw new Error('GitHub report lookup failed', { cause: error });
        await wait(Math.min(attempt * 1000, Math.max(0, deadline - now())));
      }
    }
  }
  return { request };
}

export function validateRun(run, repository, scope) {
  if (!['live', 'stage'].includes(scope)) throw new Error('Invalid report scope');
  if (!run || run.head_repository?.full_name !== repository || !['success', 'failure'].includes(run.conclusion)) return false;
  const branch = run.head_branch;
  if (typeof branch !== 'string' || !branch || ['\r', '\n', String.fromCodePoint(0)].some((character) => branch.includes(character))) return false;
  if ((scope === 'live') !== (branch === 'main')) return false;
  if (!identifier(String(run.id)) || !sha(run.head_sha) || !Number.isSafeInteger(run.run_number) || run.run_number < 1) throw new Error('Malformed report run');
  return true;
}

function reportSelection(producer, scope, artifact) {
  const entry = catalog.find((entry) => entry.id === producer);
  if (!entry || !['live', 'stage'].includes(scope)) throw new Error('Invalid report selection');
  if (entry.reports.some((report) => report.job) && artifact === undefined) throw new Error('Invalid report selection: scope artifact required');
  if (artifact !== undefined && !entry.reports.some((report) => report.artifact === artifact)) throw new Error('Invalid report selection');
  return entry.reports.find((report) => report.artifact === artifact);
}

async function scopeRunState(client, run, report) {
  for (let page = 1; page <= 5; page++) {
    const data = await client.request('jobs', String(run.id), page);
    if (!Array.isArray(data.jobs)) throw new Error('Malformed workflow jobs response');
    const jobs = data.jobs.filter((job) => job.name === report.job);
    if (jobs.length > 1) throw new Error('Ambiguous report job evidence');
    if (jobs.length) return jobWasSkipped(jobs[0]) ? 'skipped' : 'attempted';
    if (data.jobs.length < 100) return 'scope evidence unavailable';
  }
  return 'scope lookup limit reached';
}

function jobWasSkipped(job) {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  return job.conclusion === 'success'
    && steps.some((step) => step.name === 'Record unaffected scope' && step.conclusion === 'success')
    && steps.some((step) => step.name === 'Qodana Scan' && step.conclusion === 'skipped');
}

async function latestReportRun(client, matches, selection) {
  for (const run of matches) {
    const state = selection?.job ? await scopeRunState(client, run, selection) : 'attempted';
    if (state !== 'skipped') return { run, status: state === 'attempted' ? 'resolved' : state };
  }
  return null;
}

async function artifactCreationTimes(client, runId, reportNames) {
  try {
    const artifacts = [];
    for (let page = 1; page <= 5; page++) {
      const data = await client.request('artifacts', runId, page);
      if (!Array.isArray(data.artifacts)) return {};
      artifacts.push(...data.artifacts);
      if (data.artifacts.length < 100) {
        return Object.fromEntries(reportNames.flatMap((name) => {
          const matches = artifacts.filter((artifact) => artifact?.name === name && artifact.expired === false);
          return matches.length === 1 && typeof matches[0].created_at === 'string' ? [[name, matches[0].created_at]] : [];
        }));
      }
    }
  } catch {
    // Timestamp metadata is optional. Preserve the selected run and its download.
  }
  return {};
}

export async function resolveReport({ repository, token, producer, scope, report, ...options }) {
  const selection = reportSelection(producer, scope, report);
  const provenance = { producer, scope, ...(report && { report }) };
  const client = reportClient(repository, token, options);
  // Never prioritize the event's run: an older scan may complete after a newer
  // one. GitHub lists runs newest-created first; order eligible runs by run_number.
  for (let page = 1; page <= 5; page++) {
    const data = await client.request('runs', producer, page);
    if (!Array.isArray(data.workflow_runs)) throw new Error('Malformed workflow response');
    const matches = data.workflow_runs.filter((run) => validateRun(run, repository, scope));
    matches.sort((a, b) => b.run_number - a.run_number || Number(b.id) - Number(a.id));
    const selected = await latestReportRun(client, matches, selection);
    if (selected) {
      const { run, status } = selected;
      const runId = String(run.id);
      const source = { ...provenance, run_id: runId, head_sha: run.head_sha, conclusion: run.conclusion, status };
      if (status === 'resolved') {
        const reports = selection ? [selection] : catalog.find((entry) => entry.id === producer).reports;
        source.artifact_created_at = await artifactCreationTimes(client, runId, reports.map(({ artifact }) => artifact));
      }
      return source;
    }
    if (data.workflow_runs.length < 100) return { ...provenance, status: 'no matching run' };
  }
  return { ...provenance, status: 'lookup limit reached' };
}

export async function collectReport(env = process.env, options = {}) {
  const producer = env.REPORT_PRODUCER;
  const scope = env.REPORT_SCOPE;
  // Reject caller-controlled routing before creating files or issuing requests.
  const report = env.REPORT_ARTIFACT || undefined;
  reportSelection(producer, scope, report);
  repositoryParts(env.GITHUB_REPOSITORY);
  let source;
  try {
    source = await resolveReport({ repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, producer, scope, report, ...options });
  } catch {
    source = { producer, scope, ...(report && { report }), status: 'lookup failed' };
    console.warn('::warning::Report lookup failed; publishing explicit unavailable status.');
  }
  mkdirSync('.collected', { recursive: true });
  writeFileSync('.collected/source.json', JSON.stringify(source));
  if (source.status === 'resolved' && source.run_id && env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `run_id=${source.run_id}\n`);
  return source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'matrix') console.log(JSON.stringify(collectionPlan));
  else if (process.argv[2] === 'finish') {
    const source = JSON.parse(readFileSync('.collected/source.json', 'utf8'));
    const plan = collectionPlan.find((entry) => entry.producer === source.producer && entry.report === source.report);
    const outcomes = [process.env.DOWNLOAD_OUTCOME, process.env.SECOND_DOWNLOAD_OUTCOME];
    source.downloads = Object.fromEntries(plan.reports.map(({ artifact }, index) => [artifact, outcomes[index] || 'skipped']));
    writeFileSync('.collected/source.json', JSON.stringify(source));
  } else if (process.argv[2] === 'collect') await collectReport();
  else throw new Error('Unknown report operation');
}
