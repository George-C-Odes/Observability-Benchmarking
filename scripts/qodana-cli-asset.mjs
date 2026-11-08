import { resolveReleaseAsset, runAssetCli } from './github-release-asset.mjs';

export async function resolveQodanaAsset(version, fetchImpl = fetch) {
  return resolveReleaseAsset('qodana', version, fetchImpl);
}

await runAssetCli(import.meta.url, resolveQodanaAsset);
