import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changedPaths } from './changed-paths.mjs';

// Read the simple positive glob list already used by push. Unsupported syntax
// conservatively runs the job; this is intentionally not a general YAML parser.
export function pushPatterns(source) {
  const block = source.replaceAll('\r\n', '\n').split('\n  push:\n')[1]?.split(/\n(?: {2}\w|\S)/)[0];
  const paths = block?.split('\n    paths:\n')[1];
  if (!paths) return null;
  const lines = paths.trimEnd().split('\n');
  if (!lines.every((line) => /^ {6}- '[a-zA-Z0-9_./*?-]+'$/.test(line))) return null;
  return lines.map((line) => line.slice(9, -1));
}

export function matchesGlob(path, pattern) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (pattern.slice(index, index + 3) === '**/') {
      expression += '(?:.*/)?';
      index += 2;
    } else if (pattern.slice(index, index + 2) === '**') {
      expression += '.*';
      index++;
    } else if (char === '*') expression += '[^/]*';
    else if (char === '?') expression += '[^/]';
    else expression += char === '.' ? '\\.' : char;
  }
  return new RegExp(`${expression}$`).test(path);
}

export function shouldRun(eventName, paths, source) {
  if (eventName !== 'merge_group' || paths === null) return true;
  // Routing changes must themselves exercise every consumer.
  if (paths.some((path) => path.startsWith('.github/actions/workflow-scope/') ||
    /^scripts\/ci\/(changed-paths|workflow-scope).*\.mjs$/.test(path))) return true;
  const patterns = pushPatterns(source);
  return patterns === null || paths.some((path) => patterns.some((pattern) => matchesGlob(path, pattern)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const workflow = process.env.SCOPE_WORKFLOW;
  if (!/^[a-z_]+\.yml$/.test(workflow ?? '')) throw new Error('Invalid workflow filename');
  const eventName = process.env.GITHUB_EVENT_NAME;
  const paths = eventName === 'merge_group'
    ? changedPaths(eventName, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))) : null;
  const enabled = shouldRun(eventName, paths, readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8'));
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${enabled}\n`);
  if (!enabled) appendFileSync(process.env.GITHUB_STEP_SUMMARY, 'No workflow inputs changed in this merge group; checks skipped.\n');
}
