import { spawnSync } from 'node:child_process';

// null means evidence is unavailable: callers must run their complete checks.
export function changedPaths(eventName, event, git = spawnSync) {
  if (!['pull_request', 'merge_group'].includes(eventName)) return null;
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.merge_group?.base_sha;
  const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.merge_group?.head_sha;
  if (![base, head].every((sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) return null;
  const range = eventName === 'pull_request' ? [`${base}...${head}`] : [base, head];
  const result = git('git', ['diff', '--name-only', '--no-renames', '-z', ...range, '--'], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    console.warn('Unable to determine changed files; running complete checks.');
    return null;
  }
  return result.stdout.split('\0').filter(Boolean);
}
