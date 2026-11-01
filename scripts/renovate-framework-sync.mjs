import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRepoPath } from './render-readmes.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths } from './sync-framework-versions.mjs';

const envFile = 'compose/.env';

function matchesEntireString(value, pattern) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function requireGitSha(value) {
  if (!matchesEntireString(value, /^[a-f0-9]{40}$/)) throw new Error('Expected a full Git SHA');
  return value;
}

function requireRenovateRef(value) {
  // Keep nested Renovate branches, but reject Git-invalid names and URL syntax.
  if (!matchesEntireString(value, /^renovate\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/)
      || value.includes('..') || value.split('/').some((part) => part.endsWith('.') || part.endsWith('.lock'))) {
    throw new Error('Expected a valid Renovate branch ref');
  }
  return value;
}

export function buildGitHubRequest(operation, repository, identifier) {
  if (!matchesEntireString(repository, /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/)
      || ['.', '..'].includes(repository.split('/')[1])) {
    throw new Error('Expected an owner/repository GitHub identifier');
  }
  const [owner, repo] = repository.split('/');
  // Validation rejects invalid identifiers; standard component encoding also
  // makes sanitization explicit to taint analyzers. Never encode a whole route.
  const repositoryPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  let route;
  let method = 'GET';
  switch (operation) {
    case 'readPull':
      if (!Number.isSafeInteger(identifier) || identifier <= 0) throw new Error('Expected a positive PR number');
      route = `pulls/${encodeURIComponent(String(identifier))}`;
      break;
    case 'readCommit':
      route = `git/commits/${encodeURIComponent(requireGitSha(identifier))}`;
      break;
    case 'readTree':
      route = `git/trees/${encodeURIComponent(requireGitSha(identifier))}?recursive=1`;
      break;
    case 'readBlob':
      route = `git/blobs/${encodeURIComponent(requireGitSha(identifier))}`;
      break;
    case 'createBlob':
      route = 'git/blobs';
      method = 'POST';
      break;
    case 'createTree':
      route = 'git/trees';
      method = 'POST';
      break;
    case 'createCommit':
      route = 'git/commits';
      method = 'POST';
      break;
    case 'updateRef':
      route = `git/refs/heads/${encodeURIComponent(requireRenovateRef(identifier))}`;
      method = 'PATCH';
      break;
    default:
      throw new Error('Unsupported GitHub API operation');
  }
  return { url: `https://api.github.com/repos/${repositoryPath}/${route}`, method };
}

export function validateVersionChange(base, head) {
  const read = (content) => {
    const versions = {};
    let masked = content;
    for (const key of frameworkVersionKeys) {
      const pattern = new RegExp(String.raw`(^|\r?\n)(${key}:[ \t]*)(\S+)(?=[ \t]*(?:\r?\n|$))`, 'g');
      const matches = [...content.matchAll(pattern)];
      if (matches.length !== 1 || !/^[0-9][A-Za-z0-9_.-]*$/.test(matches[0][3])) {
        throw new Error(`Expected one literal framework version: ${key}`);
      }
      versions[key] = matches[0][3];
      masked = masked.replace(pattern, (_match, newline, prefix) => `${newline}${prefix}<version>`);
    }
    return { versions, masked };
  };
  const original = read(base);
  const proposed = read(head);
  if (original.masked !== proposed.masked) throw new Error('Renovate may change only active framework version values in compose/.env');
  return frameworkVersionKeys.filter((key) => original.versions[key] !== proposed.versions[key]);
}

export function assertRenovatePullRequest(pr, repository, baseSha) {
  if (pr.state !== 'open' || pr.user?.login !== 'renovate[bot]' || pr.head?.repo?.full_name !== repository
      || pr.base?.repo?.full_name !== repository || !pr.head.ref.startsWith('renovate/')
      || pr.base.sha !== baseSha) {
    throw new Error('Expected an open, same-repository Renovate PR at the trusted base revision');
  }
  requireGitSha(baseSha);
  requireGitSha(pr.head.sha);
  requireRenovateRef(pr.head.ref);
}

export function selectGeneratedUpdates(files, baseContents, headContents) {
  return files.filter(({ file, content }) => {
    const current = headContents.get(file);
    if (current === content) return false; // Repeat runs are a no-op.
    if (current !== baseContents.get(file)) throw new Error(`Refusing to overwrite a PR edit to ${file}`);
    return true;
  });
}

export function validateFrameworkTree(baseEntries, headEntries, allowed) {
  for (const file of new Set([...baseEntries.keys(), ...headEntries.keys()])) {
    const original = baseEntries.get(file);
    const proposed = headEntries.get(file);
    if (original?.type === 'tree' && proposed?.type === 'tree') continue;
    if (original?.sha === proposed?.sha && original?.mode === proposed?.mode) continue;
    if (!allowed.has(file)) throw new Error(`Unexpected file in framework PR: ${file}`);
    if (proposed?.type !== 'blob' || !['100644', '100755'].includes(proposed.mode) || proposed.mode !== original?.mode) {
      throw new Error(`Expected an unchanged regular file mode: ${file}`);
    }
  }
}

export async function api(operation, token, { identifier, body } = {}) {
  if (!token) throw new Error('Missing GitHub token');
  const { url, method } = buildGitHubRequest(operation, process.env.GITHUB_REPOSITORY, identifier);
  const response = await fetch(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub API ${operation} failed (${response.status})`);
  return response.json();
}

async function readTree(commitSha, token) {
  const commit = await api('readCommit', token, { identifier: commitSha });
  const tree = await api('readTree', token, { identifier: commit.tree.sha });
  if (tree.truncated) throw new Error('Cannot validate a truncated Git tree');
  return { sha: commit.tree.sha, entries: new Map(tree.tree.map((entry) => [entry.path, entry])) };
}

async function readBlob(tree, file, token) {
  const entry = tree.entries.get(file);
  if (entry?.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
    throw new Error(`Expected a regular tracked file, not a symlink: ${file}`);
  }
  const blob = await api('readBlob', token, { identifier: entry.sha });
  if (blob.encoding !== 'base64') throw new Error(`Unexpected blob encoding: ${file}`);
  return Buffer.from(blob.content, 'base64').toString('utf8');
}

function statePath() {
  if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP must be set by the trusted Actions runner');
  return path.join(process.env.RUNNER_TEMP, 'renovate-framework-sync.json');
}

async function prepare(event, token) {
  const repository = process.env.GITHUB_REPOSITORY;
  const baseSha = event.pull_request.base.sha;
  const pr = await api('readPull', token, { identifier: event.number });
  assertRenovatePullRequest(pr, repository, baseSha);
  const baseTree = await readTree(baseSha, token);
  const headTree = await readTree(pr.head.sha, token);
  const baseEnv = await readBlob(baseTree, envFile, token);
  const headEnv = await readBlob(headTree, envFile, token);
  const changed = validateVersionChange(baseEnv, headEnv);
  const allowed = new Set([envFile, ...generatedFrameworkPaths()]);
  // Compare complete trees rather than the paginated/truncated PR files endpoint.
  validateFrameworkTree(baseTree.entries, headTree.entries, allowed);
  if (changed.length) writeFileSync(resolveRepoPath(envFile), headEnv, 'utf8');
  writeFileSync(statePath(), JSON.stringify({ number: event.number, baseSha, headSha: pr.head.sha, ref: pr.head.ref, changed }));
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\ndjango=${changed.includes('DJANGO_VERSION')}\n`);
  console.log(changed.length ? `Synchronizing ${changed.join(', ')}` : 'No framework version changes');
}

async function publish(token) {
  const state = JSON.parse(readFileSync(statePath(), 'utf8'));
  if (!state.changed.length) return;
  const pr = await api('readPull', token, { identifier: state.number });
  assertRenovatePullRequest(pr, process.env.GITHUB_REPOSITORY, state.baseSha);
  if (pr.head.sha !== state.headSha || pr.head.ref !== state.ref) throw new Error('PR head changed during synchronization; rerun on the new revision');
  const baseTree = await readTree(state.baseSha, token);
  const headTree = await readTree(state.headSha, token);
  const files = [];
  const baseContents = new Map();
  const headContents = new Map();
  for (const file of new Set(generatedFrameworkPaths())) {
    const content = readFileSync(resolveRepoPath(file), 'utf8');
    const original = await readBlob(baseTree, file, token);
    const current = headTree.entries.get(file)?.sha === baseTree.entries.get(file)?.sha
      ? original : await readBlob(headTree, file, token);
    files.push({ file, content });
    baseContents.set(file, original);
    headContents.set(file, current);
  }
  const updates = selectGeneratedUpdates(files, baseContents, headContents);
  if (!updates.length) { console.log('Generated versions are already synchronized'); return; }
  // A PAT/App token, unlike GITHUB_TOKEN, triggers the normal path-scoped CI on the new commit.
  const writeToken = process.env.RENOVATE_SYNC_TOKEN;
  if (!writeToken) throw new Error('Configure RENOVATE_SYNC_TOKEN (contents: write, pull requests: read) so generated commits trigger CI');
  const entries = [];
  for (const { file, content } of updates) {
    const blob = await api('createBlob', writeToken, { body: { content: Buffer.from(content).toString('base64'), encoding: 'base64' } });
    requireGitSha(blob.sha);
    entries.push({ path: file, mode: baseTree.entries.get(file).mode, type: 'blob', sha: blob.sha });
  }
  const tree = await api('createTree', writeToken, { body: { base_tree: headTree.sha, tree: entries } });
  requireGitSha(tree.sha);
  const commit = await api('createCommit', writeToken, { body: {
    message: 'chore: relay framework versions from compose/.env', tree: tree.sha, parents: [state.headSha],
    author: { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
  } });
  requireGitSha(commit.sha);
  await api('updateRef', writeToken, { identifier: state.ref, body: { sha: commit.sha, force: false } });
  console.log(`Committed ${updates.length} generated files to the Renovate PR`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (mode === 'prepare') await prepare(event, process.env.GH_TOKEN);
    else if (mode === 'publish') await publish(process.env.GH_TOKEN);
    else throw new Error('Usage: node scripts/renovate-framework-sync.mjs prepare|publish');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
