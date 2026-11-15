import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const catalog = JSON.parse(readFileSync(new URL('./report-catalog.json', import.meta.url), 'utf8'));
const transient = new Set([408, 429, 500, 502, 503, 504]);
const identifier = (value) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.trim() === value;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && value.trim() === value;

function repositoryParts(repository) {
  if (typeof repository !== 'string' || repository.trim() !== repository) throw new Error('Invalid repository');
  const parts = repository.split('/');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')) throw new Error('Invalid repository');
  return parts;
}

// Request-safety gate: repository/token come from the trusted Actions launcher;
// producer/scope are fixed catalog operations. API run IDs/SHAs remain untrusted.
// Only GET list-runs/list-artifacts within this repository on api.github.com are
// authorized. Components are validated then encoded once; credentials stay in
// headers, redirects are rejected, and every attempt has a 20-second deadline.
export function reportClient(repository, token, { fetchImpl = fetch, wait = sleep } = {}) {
  const parts = repositoryParts(repository);
  const prefix = `https://api.github.com/repos/${parts.map(encodeURIComponent).join('/')}`;
  async function request(operation, value, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 5) throw new Error('Invalid page');
    let route;
    if (operation === 'runs') {
      const producer = catalog.find((entry) => entry.id === value);
      if (!producer) throw new Error('Invalid report producer');
      route = `/actions/workflows/${encodeURIComponent(producer.workflow)}/runs`;
    } else if (operation === 'artifacts' && identifier(String(value))) {
      route = `/actions/runs/${encodeURIComponent(String(value))}/artifacts`;
    } else throw new Error('Invalid report operation');
    const query = new URLSearchParams({ per_page: '100', page: String(page) });
    if (operation === 'runs') query.set('status', 'completed');
    const url = `${prefix}${route}?${query}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetchImpl(url, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
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
        await wait(attempt * 1000);
      }
    }
  }
  return { request };
}

export function validateRun(run, repository, scope) {
  if (!['live', 'stage'].includes(scope)) throw new Error('Invalid report scope');
  if (!run || run.head_repository?.full_name !== repository || !['success', 'failure'].includes(run.conclusion)) return false;
  const branch = run.head_branch;
  if (typeof branch !== 'string' || !branch || /[\r\n\x00]/.test(branch)) return false;
  if ((scope === 'live') !== (branch === 'main')) return false;
  if (!identifier(String(run.id)) || !sha(run.head_sha) || !Number.isSafeInteger(run.run_number) || run.run_number < 1) throw new Error('Malformed report run');
  return true;
}

export async function resolveReport({ repository, token, producer, scope, ...options }) {
  if (!catalog.some((entry) => entry.id === producer) || !['live', 'stage'].includes(scope)) throw new Error('Invalid report selection');
  const client = reportClient(repository, token, options);
  // Never prioritize the event's run: an older scan may complete after a newer
  // one. GitHub lists runs newest-created first; order eligible runs by run_number.
  for (let page = 1; page <= 5; page++) {
    const data = await client.request('runs', producer, page);
    if (!Array.isArray(data.workflow_runs)) throw new Error('Malformed workflow response');
    const matches = data.workflow_runs.filter((run) => validateRun(run, repository, scope));
    matches.sort((a, b) => b.run_number - a.run_number || Number(b.id) - Number(a.id));
    if (matches.length) {
      const run = matches[0];
      return { producer, scope, run_id: String(run.id), head_sha: run.head_sha, conclusion: run.conclusion, status: 'resolved' };
    }
    if (data.workflow_runs.length < 100) return { producer, scope, status: 'no matching run' };
  }
  return { producer, scope, status: 'lookup limit reached' };
}

export async function collectReport(env = process.env, options = {}) {
  const producer = env.REPORT_PRODUCER;
  const scope = env.REPORT_SCOPE;
  // Reject caller-controlled routing before creating files or issuing requests.
  if (!catalog.some((entry) => entry.id === producer) || !['live', 'stage'].includes(scope)) throw new Error('Invalid report selection');
  repositoryParts(env.GITHUB_REPOSITORY);
  let source;
  try {
    source = await resolveReport({ repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, producer, scope, ...options });
  } catch {
    source = { producer, scope, status: 'lookup failed' };
    console.warn('::warning::Report lookup failed; publishing explicit unavailable status.');
  }
  mkdirSync('.collected', { recursive: true });
  writeFileSync('.collected/source.json', JSON.stringify(source));
  if (source.run_id && env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `run_id=${source.run_id}\n`);
  return source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'matrix') console.log(JSON.stringify(catalog));
  else if (process.argv[2] === 'finish') {
    const source = JSON.parse(readFileSync('.collected/source.json', 'utf8'));
    source.download = process.env.DOWNLOAD_OUTCOME || 'skipped';
    writeFileSync('.collected/source.json', JSON.stringify(source));
  } else if (process.argv[2] === 'collect') await collectReport();
  else throw new Error('Unknown report operation');
}
