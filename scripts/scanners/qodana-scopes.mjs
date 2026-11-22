import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changedPaths } from '../ci/changed-paths.mjs';

const all = () => ({ 'services-java': true, orchestrator: true });

export function selectScopes(paths) {
  const selected = { 'services-java': false, orchestrator: false };
  for (const path of paths) {
    if (path.startsWith('services/java/') && !path.endsWith('.md')) selected['services-java'] = true;
    if (path.startsWith('utils/orchestrator/') && !path.endsWith('.md')) selected.orchestrator = true;
    if (path === '.qodana/baseline/services-java.sarif.json') selected['services-java'] = true;
    else if (path === '.qodana/baseline/orchestrator.sarif.json') selected.orchestrator = true;
    else if (path === 'qodana.yaml' || path === '.idea/misc.xml' || path.startsWith('.qodana/baseline/') ||
      path === '.github/workflows/qodana_code_quality.yml' || path === '.github/qodana-cli-lock.json' ||
      path.startsWith('.github/actions/upload-artifact/') ||
      /^scripts\/(?:ci\/(?:qodana-cli-asset|changed-paths|github-release-asset)|scanners\/qodana-(?:scopes|project)).*\.mjs$/.test(path)) return all();
  }
  return selected;
}

export function scopesForEvent(eventName, event, git = spawnSync) {
  const paths = changedPaths(eventName, event, git);
  return paths === null ? all() : selectScopes(paths);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const selected = scopesForEvent(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  for (const [name, enabled] of Object.entries(selected)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${enabled}\n`);
  }
  console.log(`Qodana scopes: ${JSON.stringify(selected)}`);
}
