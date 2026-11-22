import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

// Only these reviewed tool profiles select repositories and asset names.
const tools = new Map([
  ['qodana', {
    repository: 'JetBrains/qodana-cli',
    label: 'Qodana',
    versionLabel: 'Qodana CLI',
    versionPattern: /^[0-9]{4}\.[0-9]+\.[0-9]+$/,
    assetName: () => 'qodana_linux_x86_64.tar.gz',
    platform: 'Linux x86-64',
  }],
  ['golangci-lint', {
    repository: 'golangci/golangci-lint',
    label: 'golangci-lint',
    versionLabel: 'golangci-lint',
    versionPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    assetName: (version) => `golangci-lint-${version}-linux-amd64.tar.gz`,
    platform: 'Linux amd64',
  }],
]);

function validateReleaseAssetLock(lock, profile, name, expectedSha256) {
  if (expectedSha256 === undefined || lock.repository !== profile.repository || lock.assetName !== name || lock.sha256 !== expectedSha256 || !Number.isSafeInteger(lock.assetId) || lock.assetId <= 0) {
    throw new Error('Release asset lock does not match the pinned checksum or tool');
  }
}

export async function resolveReleaseAsset(tool, version, fetchImpl = fetch, { wait = sleep, warn = console.error, lock, expectedSha256 } = {}) {
  const profile = tools.get(tool);
  if (!profile) throw new Error('Unsupported release asset tool');
  if (typeof version !== 'string' || version.trim() !== version || !profile.versionPattern.test(version)) {
    throw new Error(`Invalid ${profile.versionLabel} version`);
  }
  if (expectedSha256 !== undefined && (typeof expectedSha256 !== 'string' || expectedSha256.trim() !== expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256))) {
    throw new Error('Invalid expected release asset SHA-256');
  }
  const tag = `v${version}`;
  const baseUrl = `https://api.github.com/repos/${profile.repository}/releases`;
  const name = profile.assetName(version);
  if (lock?.version === version) {
    validateReleaseAssetLock(lock, profile, name, expectedSha256);
    return `${baseUrl}/assets/${lock.assetId}`;
  }
  let release;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(`${baseUrl}/tags/${encodeURIComponent(tag)}`, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error(`${profile.label} release lookup failed: HTTP ${response.status}`), { retryable: [408, 429, 500, 502, 503, 504].includes(response.status) });
      }
      release = await response.json();
      break;
    } catch (error) {
      const codes = ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'];
      const retryable = error?.retryable === true || ['TimeoutError', 'AbortError'].includes(error?.name) || codes.includes(error?.code) || codes.includes(error?.cause?.code);
      if (!retryable || attempt === 3) throw error;
      const delay = 2_000 * 2 ** (attempt - 1);
      warn(`${profile.label} release lookup: transient failure on attempt ${attempt}/3; retrying in ${delay / 1000}s.`);
      await wait(delay);
    }
  }
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error(`Unexpected ${profile.label} release metadata`);
  const assets = release.assets.filter((asset) => asset?.name === name);
  if (assets.length !== 1 || !Number.isSafeInteger(assets[0].id) || assets[0].id <= 0) {
    throw new Error(`Missing, ambiguous or invalid ${profile.label} ${profile.platform} asset`);
  }
  // Release metadata is untrusted: ignore supplied URLs and use only the safe ID.
  return `${baseUrl}/assets/${assets[0].id}`;
}

export async function runAssetCli(moduleUrl, resolveAsset) {
  if (!process.argv[1] || path.resolve(process.argv[1]) !== fileURLToPath(moduleUrl)) return;
  try {
    console.log(await resolveAsset(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
