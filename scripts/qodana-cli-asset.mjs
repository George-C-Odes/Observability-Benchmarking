import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the reviewed version pin enters the request. Release metadata is untrusted:
// ignore supplied URLs and construct the asset endpoint from a validated ID.
export async function resolveQodanaAsset(version, fetchImpl = fetch) {
  if (typeof version !== 'string' || version.trim() !== version || !/^[0-9]{4}\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error('Invalid Qodana CLI version');
  }
  const tag = `v${version}`;
  const response = await fetchImpl(`https://api.github.com/repos/JetBrains/qodana-cli/releases/tags/${encodeURIComponent(tag)}`, {
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Qodana release lookup failed: HTTP ${response.status}`);
  const release = await response.json();
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error('Unexpected Qodana release metadata');
  const assets = release.assets.filter((asset) => asset?.name === 'qodana_linux_x86_64.tar.gz');
  if (assets.length !== 1 || !Number.isSafeInteger(assets[0].id) || assets[0].id <= 0) {
    throw new Error('Missing, ambiguous or invalid Qodana Linux x86-64 asset');
  }
  return `https://api.github.com/repos/JetBrains/qodana-cli/releases/assets/${assets[0].id}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await resolveQodanaAsset(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
