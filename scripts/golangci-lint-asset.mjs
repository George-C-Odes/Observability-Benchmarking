import { resolveReleaseAsset, runAssetCli } from './github-release-asset.mjs';

export async function resolveGolangciLintAsset(version, fetchImpl = fetch) {
  return resolveReleaseAsset('golangci-lint', version, fetchImpl);
}

await runAssetCli(import.meta.url, resolveGolangciLintAsset);
