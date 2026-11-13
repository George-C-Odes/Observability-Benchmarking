import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRepoPath } from './render-readmes.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths, generatedNextjsPaths } from './sync-framework-versions.mjs';

import { readNodeVersion } from './sync-node-versions.mjs';
import { dashboardPackageVersions, readDashboardPackageVersions } from './image-tags.mjs';

const envFile = 'compose/.env';
const nextManifest = 'utils/nextjs-dash/package.json';
const nextLock = 'utils/nextjs-dash/package-lock.json';

function validateNextjsManifest(base, head) {
  const original = JSON.parse(base);
  const proposed = JSON.parse(head);
  const masked = (manifest) => {
    const copy = structuredClone(manifest);
    for (const section of ['dependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(copy[section] ?? {})) {
        if (!matchesEntireString(version, /^[~^]?\d+\.\d+\.\d+$/)) throw new Error('Expected a stable npm version');
        copy[section][name] = '<version>';
      }
    }
    return copy;
  };
  if (JSON.stringify(masked(original)) !== JSON.stringify(masked(proposed))) {
    throw new Error('Only existing npm dependency versions may change');
  }
  if (!matchesEntireString(proposed.dependencies.next, /^\d+\.\d+\.\d+$/)) {
    throw new Error('Next.js must use a stable npm version without a range');
  }
  readDashboardPackageVersions(proposed);
  return { original, proposed };
}

// expectedLock must be independently generated from the trusted base lock, never
// from the proposal: npm can preserve malicious resolved/integrity fields.
export function validateNextjsChange(base, head, lock, expectedLock) {
  const { original, proposed } = validateNextjsManifest(base, head);
  const parsedLock = JSON.parse(lock);
  if (parsedLock.lockfileVersion !== 3 || parsedLock.name !== proposed.name
      || parsedLock.version !== proposed.version) throw new Error('Expected the dashboard npm lockfile');
  for (const section of ['dependencies', 'devDependencies']) {
    if (JSON.stringify(parsedLock.packages?.['']?.[section]) !== JSON.stringify(proposed[section])) {
      throw new Error('Lockfile root must match the proposed dependency versions');
    }
  }
  if (!expectedLock || !isDeepStrictEqual(parsedLock, JSON.parse(expectedLock))) {
    throw new Error('Complete lockfile must match trusted npm regeneration');
  }
  return dashboardPackageVersions
    .filter(([_key, section, name]) => original[section][name] !== proposed[section][name])
    .map(([key]) => key);
}

export function regenerateNextjsLock(manifest, baseLock) {
  // Use the npm shipped with the trusted Node installation, never a PR binary
  // or a Windows shell wrapper. The workflow checks out only the trusted base.
  const nodeDirectory = path.dirname(realpathSync(process.execPath));
  const npmCli = [path.join(nodeDirectory, 'bin/node_modules/npm/bin/npm-cli.js'),
    path.join(nodeDirectory, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
  if (!npmCli) throw new Error('Cannot locate npm in the trusted Node installation');
  const npmVersion = JSON.parse(readFileSync(path.join(path.dirname(npmCli), '../package.json'), 'utf8')).version;
  const packageManager = JSON.parse(manifest).packageManager;
  if (packageManager && packageManager !== `npm@${npmVersion}`) {
    throw new Error('Trusted npm version must match the dashboard packageManager pin');
  }
  const directory = mkdtempSync(path.join(os.tmpdir(), 'renovate-nextjs-lock-'));
  try {
    writeFileSync(path.join(directory, 'package.json'), manifest);
    writeFileSync(path.join(directory, 'package-lock.json'), baseLock);
    for (const file of ['user.npmrc', 'global.npmrc']) writeFileSync(path.join(directory, file), '');
    // Do not expose GitHub tokens, user npm config, or the shared npm cache.
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      TEMP: directory, TMP: directory, HOME: directory, USERPROFILE: directory };
    const result = childProcess.spawnSync(process.execPath, [npmCli, 'install', '--package-lock-only',
      '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/',
      '--update-notifier=false',
      '--fetch-retries=0', '--fetch-timeout=60000', '--cache', path.join(directory, 'cache'),
      '--userconfig', path.join(directory, 'user.npmrc'), '--globalconfig', path.join(directory, 'global.npmrc')],
    { cwd: directory, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 1024 * 1024, shell: false });
    if (result.error || result.status !== 0) {
      const detail = result.error?.code ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
      throw new Error(`Trusted npm lockfile regeneration failed (${detail})`);
    }
    return readFileSync(path.join(directory, 'package-lock.json'), 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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
      if (matches.length !== 1 || !/^\d[A-Za-z0-9_.-]*$/.test(matches[0][3])) {
        throw new Error(`Expected one literal framework version: ${key}`);
      }
      versions[key] = matches[0][3];
      masked = masked.replace(pattern, (_match, newline, prefix) => `${newline}${prefix}<version>`);
    }
    readNodeVersion(versions);
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

export function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  // S4790 review: SHA-1 is required to match GitHub's Git blob object IDs.
  // This is Git change detection, not password hashing, signing or authentication;
  // PR identity, repository scope and file modes are validated independently.
  // Do not reuse this helper for security-sensitive digests or disable S4790 globally.
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); // NOSONAR - S4790: required Git blob-ID compatibility; rationale above.
}

export function selectGeneratedUpdates(files, baseEntries, headEntries) {
  return files.filter(({ file, content }) => {
    const original = baseEntries.get(file);
    const current = headEntries.get(file);
    for (const entry of [original, current]) {
      if (entry?.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
        throw new Error(`Expected a regular tracked file, not a symlink: ${file}`);
      }
      requireGitSha(entry.sha);
    }
    if (current.mode !== original.mode) throw new Error(`Expected an unchanged regular file mode: ${file}`);
    if (current.sha === gitBlobSha(content)) return false; // Repeat runs are a no-op.
    if (current.sha !== original.sha) throw new Error(`Refusing to overwrite a PR edit to ${file}`);
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
  // Reviewed S8476 false positive (PR 424, issue AaGY1oYFDeJydjxQPt0K):
  // Sonar carries readCommit's response tree SHA into updateRef, but that caller
  // selects readTree, which requires a full SHA; updateRef requires a Renovate ref.
  // Fixed operations/origin/repository scope, strict identifier validation and
  // per-component encoding prevent URL injection; redirects are rejected below.
  // renovate-framework-sync.test.mjs verifies zero subsequent requests for the
  // reported SHA-to-ref path and malicious inputs, plus valid publication behavior.
  // User-approved 2026-11-02: JavaScript NOSONAR is line-wide, NOT S8476-only;
  // it also hides other findings at this shared sink. Re-review/remove if callers,
  // scope, validators, encoding or redirect policy change. Never copy by default.
  const response = await fetch(url, { // NOSONAR - reviewed S8476 false positive; line-wide scope explicitly accepted above.
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

export async function prepare(event, token, route = 'env') {
  if (!['env', 'nextjs'].includes(route)) throw new Error('Unknown version relay route');
  const repository = process.env.GITHUB_REPOSITORY;
  const baseSha = event.pull_request.base.sha;
  const pr = await api('readPull', token, { identifier: event.number });
  assertRenovatePullRequest(pr, repository, baseSha);
  const baseTree = await readTree(baseSha, token);
  const headTree = await readTree(pr.head.sha, token);
  const baseEnv = await readBlob(baseTree, envFile, token);
  const headEnv = await readBlob(headTree, envFile, token);
  let changed;
  let manifest;
  const allowed = new Set(route === 'nextjs'
    ? [nextManifest, nextLock, ...generatedNextjsPaths()]
    : [envFile, ...generatedFrameworkPaths()]);
  // Reject source/config edits before invoking npm or materializing PR data.
  validateFrameworkTree(baseTree.entries, headTree.entries, allowed);
  if (route === 'nextjs') {
    if (baseEnv !== headEnv) throw new Error('npm relay may not change compose/.env');
    const original = await readBlob(baseTree, nextManifest, token);
    manifest = await readBlob(headTree, nextManifest, token);
    const lock = await readBlob(headTree, nextLock, token);
    validateNextjsManifest(original, manifest);
    const baseLock = await readBlob(baseTree, nextLock, token);
    const expectedLock = regenerateNextjsLock(manifest, baseLock);
    changed = validateNextjsChange(original, manifest, lock, expectedLock);
  } else changed = validateVersionChange(baseEnv, headEnv);
  if (changed.length) {
    if (route === 'nextjs') writeFileSync(resolveRepoPath(nextManifest), manifest, 'utf8');
    else writeFileSync(resolveRepoPath(envFile), headEnv, 'utf8');
  }
  writeFileSync(statePath(), JSON.stringify({ number: event.number, baseSha, headSha: pr.head.sha, ref: pr.head.ref, changed, route }));
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length > 0}\npython_locks=${changed.some((key) => ['DJANGO_VERSION', 'GUNICORN_VERSION'].includes(key))}\n`);
  console.log(changed.length ? `Synchronizing ${changed.join(', ')}` : 'No framework version changes');
}

export async function publish(token) {
  const state = JSON.parse(readFileSync(statePath(), 'utf8'));
  if (!state.changed.length) return;
  const pr = await api('readPull', token, { identifier: state.number });
  assertRenovatePullRequest(pr, process.env.GITHUB_REPOSITORY, state.baseSha);
  if (pr.head.sha !== state.headSha || pr.head.ref !== state.ref) throw new Error('PR head changed during synchronization; rerun on the new revision');
  const baseTree = await readTree(state.baseSha, token);
  const headTree = await readTree(state.headSha, token);
  const files = [...new Set(state.route === 'nextjs' ? generatedNextjsPaths() : generatedFrameworkPaths())].map((file) => ({
    file, content: readFileSync(resolveRepoPath(file), 'utf8'),
  }));
  const updates = selectGeneratedUpdates(files, baseTree.entries, headTree.entries);
  if (!updates.length) { console.log('Generated versions are already synchronized'); return; }
  // A PAT/App token, unlike GITHUB_TOKEN, triggers the normal path-scoped CI on the new commit.
  const writeToken = process.env.RENOVATE_SYNC_TOKEN;
  if (!writeToken) throw new Error('Configure RENOVATE_SYNC_TOKEN (contents: write, pull requests: read) so generated commits trigger CI');
  // Await each upload in order to avoid concurrent GitHub content-creation requests.
  const entries = await Array.fromAsync(updates, async ({ file, content }) => {
    const blob = await api('createBlob', writeToken, { body: { content: Buffer.from(content).toString('base64'), encoding: 'base64' } });
    requireGitSha(blob.sha);
    return { path: file, mode: baseTree.entries.get(file).mode, type: 'blob', sha: blob.sha };
  });
  const tree = await api('createTree', writeToken, { body: { base_tree: headTree.sha, tree: entries } });
  requireGitSha(tree.sha);
  const commit = await api('createCommit', writeToken, { body: {
    message: state.route === 'nextjs' ? 'chore: relay Next.js image tags from package.json'
      : 'chore: relay framework versions from compose/.env', tree: tree.sha, parents: [state.headSha],
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
    else if (mode === 'prepare-nextjs') await prepare(event, process.env.GH_TOKEN, 'nextjs');
    else if (mode === 'publish') await publish(process.env.GH_TOKEN);
    else throw new Error('Usage: node scripts/renovate-framework-sync.mjs prepare|prepare-nextjs|publish');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
