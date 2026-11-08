import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Release metadata is external input. Ignore supplied URLs and construct only
// the fixed repository's asset endpoint from a validated numeric ID.
export async function resolveGolangciLintAsset(version, fetchImpl = fetch) {
  if (typeof version !== 'string' || version.trim() !== version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error('Invalid golangci-lint version');
  }
  const tag = `v${version}`;
  const response = await fetchImpl(`https://api.github.com/repos/golangci/golangci-lint/releases/tags/${encodeURIComponent(tag)}`, {
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`golangci-lint release lookup failed: HTTP ${response.status}`);
  const release = await response.json();
  if (release?.tag_name !== tag || !Array.isArray(release.assets)) throw new Error('Unexpected golangci-lint release metadata');
  const name = `golangci-lint-${version}-linux-amd64.tar.gz`;
  const assets = release.assets.filter((asset) => asset?.name === name);
  if (assets.length !== 1 || !Number.isSafeInteger(assets[0].id) || assets[0].id <= 0) {
    throw new Error('Missing, ambiguous or invalid golangci-lint Linux amd64 asset');
  }
  return `https://api.github.com/repos/golangci/golangci-lint/releases/assets/${assets[0].id}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(await resolveGolangciLintAsset(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
