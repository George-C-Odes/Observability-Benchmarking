import { readFileSync } from 'node:fs';

import { deriveOutputPath, loadManifestTemplatePaths, renderTemplates, resolveRepoPath } from './render-readmes.mjs';
import { syncBuildImageRuns } from './sync-build-img-runs.mjs';
import { runSyncCli } from './sync-common.mjs';
import { syncImageTags } from './sync-image-tags.mjs';

// Use only trusted generators and JSON data; never run npm on PR dependencies.
export function syncNextjsTags({ envPath = 'compose/.env', check = false } = {}) {
  const results = [...syncImageTags({ envPath, check }), ...syncBuildImageRuns({ envPath, check })];
  const templatePaths = loadManifestTemplatePaths('scripts/render-readmes.manifest.json');
  const before = new Map(templatePaths.map((file) => {
    const output = resolveRepoPath(deriveOutputPath(file));
    return [output, readFileSync(output, 'utf8')];
  }));
  for (const { outputPath } of renderTemplates({ envPath, check, templatePaths })) {
    results.push({ filePath: outputPath, changed: before.get(outputPath) !== readFileSync(outputPath, 'utf8') });
  }
  return results;
}

runSyncCli(import.meta.url, syncNextjsTags, 'Next.js image tags');
