import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readSyncFile, runSyncCli } from './sync-common.mjs';

export const nodeVersionKeys = ['NODE_MAJOR_VERSION', 'NODE_MINOR_PATCH_VERSION'];
export const nodeGeneratedPaths = ['utils/nextjs-dash/Dockerfile', '.github/actions/setup-nextjs/action.yml',
  '.github/actions/setup-node/action.yml'];

export function readNodeVersion(variables) {
  const major = variables.NODE_MAJOR_VERSION;
  const minorPatch = variables.NODE_MINOR_PATCH_VERSION;
  if (typeof major !== 'string' || !/^[1-9]\d*$/.test(major) || /\s/.test(major)) throw new Error('NODE_MAJOR_VERSION must be a positive integer');
  if (typeof minorPatch !== 'string' || !/^\d+\.\d+$/.test(minorPatch) || /\s/.test(minorPatch)) throw new Error('NODE_MINOR_PATCH_VERSION must be a stable minor.patch release');
  return { major, minorPatch, full: `${major}.${minorPatch}` };
}

export function syncNodeContent(content, file, { full }) {
  if (file.endsWith('/Dockerfile')) {
    const defaults = [...content.matchAll(/^ARG IMAGE_(?:DEPS|RUNTIME)=node:/gm)];
    if (defaults.length !== 2) throw new Error('Expected two Node image defaults');
    return content.replace(/(node:)(\d+\.\d+\.\d+)(-[a-z0-9.-]+)(@sha256:[a-f0-9]+)?/g,
      (_match, prefix, old, suffix, digest = '') => `${prefix}${full}${suffix}${old === full ? digest : ''}`);
  }
  const pattern = file.includes('/actions/') ? /(^ {4}default: )'[\d.]+'(?=\r?$)/gm : /(node-version: )'[\d.]+'/g;
  if ([...content.matchAll(pattern)].length !== 1) throw new Error('Expected one Node version setting');
  return content.replace(pattern, (_match, prefix) => `${prefix}'${full}'`);
}

export function syncNodeVersions({ envPath = 'compose/.env', check = false } = {}) {
  const version = readNodeVersion(parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8')));
  const results = nodeGeneratedPaths.map((file) => readSyncFile(resolveRepoPath(file),
    (content) => syncNodeContent(content, file, version), file));
  return finishSync(results, { check, description: 'Node runtime versions', scriptName: 'sync-node-versions.mjs',
    displayPath: (file) => path.relative(resolveRepoPath('.'), file) });
}

runSyncCli(import.meta.url, syncNodeVersions, 'Node runtime version files');
