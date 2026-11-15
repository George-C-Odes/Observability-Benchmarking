import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const all = () => ({ 'services-java': true, orchestrator: true });

export function selectScopes(paths) {
  const selected = { 'services-java': false, orchestrator: false };
  for (const path of paths) {
    if (path.startsWith('services/java/') && !path.endsWith('.md')) selected['services-java'] = true;
    if (path.startsWith('utils/orchestrator/') && !path.endsWith('.md')) selected.orchestrator = true;
    if (path === '.qodana/baseline/services-java.sarif.json') selected['services-java'] = true;
    else if (path === '.qodana/baseline/orchestrator.sarif.json') selected.orchestrator = true;
    else if (path === 'qodana.yaml' || path === '.idea/misc.xml' || path.startsWith('.qodana/baseline/') ||
      path === 'services/java/quarkus/native/mvnw' || path.startsWith('services/java/quarkus/native/.mvn/') ||
      path === '.github/workflows/qodana_code_quality.yml' || path === '.github/qodana-cli-lock.json' ||
      path.startsWith('.github/actions/upload-artifact/') ||
      /^scripts\/(qodana-(cli-asset|scopes)|github-release-asset).*\.mjs$/.test(path)) return all();
  }
  return selected;
}

export function scopesForEvent(eventName, event, git = spawnSync) {
  // Main and manual runs retain complete paired reports for the Pages consumer.
  if (!['pull_request', 'merge_group'].includes(eventName)) return all();
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.merge_group?.base_sha;
  const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.merge_group?.head_sha;
  if (![base, head].every((sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) return all();
  // PRs compare their merge base; merge groups compare the assembled group to its base.
  // No shell, refs, or filenames from the event are executed. Renames include both paths.
  const range = eventName === 'pull_request' ? [`${base}...${head}`] : [base, head];
  const result = git('git', ['diff', '--name-only', '--no-renames', '-z', ...range, '--'], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    console.warn('Unable to determine changed files; scanning both Java scopes.');
    return all();
  }
  return selectScopes(result.stdout.split('\0').filter(Boolean));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const selected = scopesForEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  for (const [name, enabled] of Object.entries(selected)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${enabled}\n`);
  }
  console.log(`Qodana scopes: ${JSON.stringify(selected)}`);
}
