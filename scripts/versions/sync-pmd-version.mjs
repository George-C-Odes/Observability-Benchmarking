import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

// The orchestrator POM's <pmd.version> is the single source for the PMD version.
// The CLI archive lock (version + upstream SHA-256) is generated from it so the
// PMD workflow never needs a workflow-file edit, and docs read the POM directly.
export const pmdPom = 'utils/orchestrator/pom.xml';
export const pmdLock = '.github/pmd-lock.json';
export const pmdVersionKey = 'PMD_VERSION';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const stableVersion = /^\d+\.\d+\.\d+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const pomPropertyPattern = /<pmd\.version>([^<]*)<\/pmd\.version>/g;
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);
const transientCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

function requireStableVersion(version, source) {
  if (typeof version !== 'string' || version.trim() !== version || !stableVersion.test(version)) {
    throw new Error(`Expected a stable X.Y.Z PMD version in ${source}`);
  }
  return version;
}

function readPmdProperty(content) {
  const matches = [...content.matchAll(pomPropertyPattern)];
  if (matches.length !== 1) throw new Error(`Expected one <pmd.version> property in ${pmdPom}`);
  return { version: requireStableVersion(matches[0][1], pmdPom), index: matches[0].index, length: matches[0][0].length };
}

export function readPmdVersion(pom) {
  return readPmdProperty(pom).version;
}

function maskPmdVersion(pom) {
  const { index, length } = readPmdProperty(pom);
  return `${pom.slice(0, index)}<pmd.version><version></pmd.version>${pom.slice(index + length)}`;
}

// Returns whether the PMD version changed; any other POM edit is rejected.
export function validatePmdChange(base, head) {
  if (maskPmdVersion(base) !== maskPmdVersion(head)) {
    throw new Error(`Renovate may change only the <pmd.version> property in ${pmdPom}`);
  }
  return readPmdVersion(base) !== readPmdVersion(head);
}

export function pmdTemplateVariables(keys, readSource) {
  if (!keys.has(pmdVersionKey)) return {};
  return { [pmdVersionKey]: readPmdVersion(readSource(pmdPom)) };
}

export function pmdAssetName(version) {
  return `pmd-dist-${requireStableVersion(version, 'the PMD lock')}-bin.zip`;
}

export function readPmdLock(content) {
  let lock;
  try {
    lock = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${pmdLock}`, { cause: error });
  }
  const keys = lock && typeof lock === 'object' && !Array.isArray(lock) ? Object.keys(lock) : [];
  if (keys.length !== 3 || !['version', 'assetName', 'sha256'].every((key) => keys.includes(key))) {
    throw new Error(`${pmdLock} must contain exactly version, assetName and sha256`);
  }
  const version = requireStableVersion(lock.version, pmdLock);
  if (lock.assetName !== pmdAssetName(version)) throw new Error(`${pmdLock} assetName must match its version`);
  if (typeof lock.sha256 !== 'string' || !sha256Pattern.test(lock.sha256)) throw new Error(`${pmdLock} must pin a lowercase SHA-256`);
  return { version, assetName: lock.assetName, sha256: lock.sha256 };
}

export function formatPmdLock(version, sha256) {
  if (typeof sha256 !== 'string' || !sha256Pattern.test(sha256)) throw new Error('Expected a lowercase PMD archive SHA-256');
  return `${JSON.stringify({ version: requireStableVersion(version, pmdPom), assetName: pmdAssetName(version), sha256 }, null, 2)}\n`;
}

function transient(error) {
  return error?.retryable === true || ['TimeoutError', 'AbortError'].includes(error?.name) || transientCodes.has(error?.code) || transientCodes.has(error?.cause?.code);
}

export function pmdReleaseUrl(version) {
  // Request scope: fixed HTTPS origin and the pmd/pmd releases endpoint. The only
  // dynamic component is the PMD release tag, built from a validated X.Y.Z version
  // and encoded once, so its slash stays inside the tag (pmd_releases%2FX.Y.Z).
  const tag = `pmd_releases/${requireStableVersion(version, 'the PMD release lookup')}`;
  return { tag, url: `https://api.github.com/repos/pmd/pmd/releases/tags/${encodeURIComponent(tag)}` };
}

function releaseDigest(release, tag, name) {
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error('Unexpected PMD release metadata');
  const assets = release.assets.filter((asset) => asset?.name === name);
  const digest = assets[0]?.digest;
  if (assets.length !== 1 || typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Missing, ambiguous or invalid PMD release asset digest for ${name}`);
  }
  return digest.slice('sha256:'.length);
}

// Reads the archive digest that GitHub publishes for PMD's own release asset.
// Unauthenticated: no credentials are sent, and redirects are rejected.
export async function resolvePmdDigest(version, fetchImpl = fetch, { wait = sleep, warn = console.error } = {}) {
  const { tag, url } = pmdReleaseUrl(version);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'GET', headers: { Accept: 'application/vnd.github+json' },
        redirect: 'error', signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error(`PMD release lookup failed: HTTP ${response.status}`), { retryable: transientStatuses.has(response.status) });
      }
      return releaseDigest(await response.json(), tag, pmdAssetName(version));
    } catch (error) {
      if (!transient(error) || attempt === 3) throw error;
      const delay = 2_000 * 2 ** (attempt - 1);
      warn(`PMD release lookup: transient failure on attempt ${attempt}/3; retrying in ${delay / 1000}s.`);
      await wait(delay);
    }
  }
  throw new Error('PMD release lookup failed');
}

// Offline drift check, shared with the combined framework-version check.
export function assertPmdLockCurrent(pom, lock) {
  const version = readPmdVersion(pom);
  const locked = readPmdLock(lock);
  if (locked.version !== version) {
    throw new Error(`${pmdLock} pins PMD ${locked.version} but ${pmdPom} uses ${version}. Run node scripts/versions/sync-pmd-version.mjs`);
  }
  return locked;
}

// Refreshes the lock from the POM. Check mode and an already-current lock never fetch.
export async function syncPmdLock({ check = false, root = repoRoot, fetchImpl = fetch, ...retryOptions } = {}) {
  const lockPath = path.join(root, pmdLock);
  const pom = readFileSync(path.join(root, pmdPom), 'utf8');
  const existing = readFileSync(lockPath, 'utf8');
  const version = readPmdVersion(pom);
  let current = false;
  try {
    assertPmdLockCurrent(pom, existing);
    current = true;
  } catch (error) {
    if (check) throw error;
  }
  if (current) return { filePath: lockPath, content: existing, changed: false };
  const content = formatPmdLock(version, await resolvePmdDigest(version, fetchImpl, retryOptions));
  writeFileSync(lockPath, content, 'utf8');
  return { filePath: lockPath, content, changed: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--check')) throw new Error('Usage: node scripts/versions/sync-pmd-version.mjs [--check]');
    const { changed } = await syncPmdLock({ check: args.includes('--check') });
    console.log(changed ? `Updated ${pmdLock}` : `${pmdLock} is current.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
