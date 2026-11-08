import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function resolveReleaseAsset(tool, version, fetchImpl = fetch) {
  const profile = tools.get(tool);
  if (!profile) throw new Error('Unsupported release asset tool');
  if (typeof version !== 'string' || version.trim() !== version || !profile.versionPattern.test(version)) {
    throw new Error(`Invalid ${profile.versionLabel} version`);
  }
  const tag = `v${version}`;
  const baseUrl = `https://api.github.com/repos/${profile.repository}/releases`;
  const response = await fetchImpl(`${baseUrl}/tags/${encodeURIComponent(tag)}`, {
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${profile.label} release lookup failed: HTTP ${response.status}`);
  const release = await response.json();
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error(`Unexpected ${profile.label} release metadata`);
  const name = profile.assetName(version);
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
