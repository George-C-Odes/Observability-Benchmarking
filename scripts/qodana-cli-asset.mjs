import { resolveReleaseAsset, runAssetCli } from './github-release-asset.mjs';
import { readFileSync } from 'node:fs';

export async function resolveQodanaAsset(version, fetchImpl = fetch, options) {
  return resolveReleaseAsset('qodana', version, fetchImpl, options);
}

await runAssetCli(import.meta.url, (version) => resolveQodanaAsset(version, fetch, {
  // Supplying the workflow's checksum opts into an exact version/checksum lock.
  // Other versions use live lookup; never reuse an older version's asset ID.
  expectedSha256: process.argv[3],
  lock: process.argv[3] === undefined ? undefined : JSON.parse(readFileSync(new URL('../.github/qodana-cli-lock.json', import.meta.url), 'utf8')),
}));
