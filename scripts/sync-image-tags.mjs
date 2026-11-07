import { readFileSync } from 'node:fs';
import path from 'node:path';

import { formatImageTag, imageDefinitions, loadImageVariables } from './image-tags.mjs';
import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readSyncFile, runSyncCli } from './sync-common.mjs';

export const imageTagGeneratedPaths = ['compose/docker-compose.yml', 'compose/utils.yml'];

export function syncComposeImageTags(content, variables) {
  return content.replace(/^([ \t]*(?:image|BUILDKIT_BUILD_NAME):[ \t]*)([a-z0-9-]+):[^\s#]+/gm,
    (match, prefix, name) => imageDefinitions.some((entry) => entry.name === name)
      ? `${prefix}${formatImageTag(name, variables)}` : match);
}

export function syncImageTags({ envPath = 'compose/.env', check = false } = {}) {
  const variables = loadImageVariables(parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8')));
  const results = imageTagGeneratedPaths.map((file) => readSyncFile(resolveRepoPath(file),
    (content) => syncComposeImageTags(content, variables), file));
  return finishSync(results, { check, description: 'Compose image tags', scriptName: 'sync-image-tags.mjs',
    displayPath: (file) => path.relative(resolveRepoPath('.'), file) });
}

runSyncCli(import.meta.url, syncImageTags, 'Compose image tags');
