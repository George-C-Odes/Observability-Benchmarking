import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readSyncFile, runSyncCli } from './sync-common.mjs';

export const goModules = ['services/go/enhanced', 'services/go/simple', '.github/go-tools'];

function validateVersion(version) {
  if (typeof version !== 'string' || !/^1\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error('Missing or invalid GO_VERSION in the env file (expected an unquoted stable version such as 1.27.3)');
  }
}

export function syncGoModContent(content, version) {
  validateVersion(version);
  // Version tokens cannot contain '/', keeping them disjoint from // comments.
  const goPattern = /^([\t ]*go[\t ]+)([^/\t \r\n]+)([\t ]*(?:\/\/[^\r\n]*)?\r?)$/gm;
  const declarations = [...content.matchAll(goPattern)];
  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one go directive, found ${declarations.length}`);
  }
  const toolchainPattern = /^([\t ]*toolchain[\t ]+)([^/\t \r\n]+)([\t ]*(?:\/\/[^\r\n]*)?\r?)$/gm;
  const toolchains = [...content.matchAll(toolchainPattern)];
  if (toolchains.length > 1 || toolchains.some((match) => !/^(?:default|go1\.\d+(?:\.\d+)?)$/.test(match[2]))) {
    throw new Error('Expected at most one standard Go toolchain directive or toolchain default');
  }
  return content.replace(goPattern, (_match, prefix, _old, suffix) => `${prefix}${version}${suffix}`)
    .replace(toolchainPattern, (_match, prefix, old, suffix) => `${prefix}${old === 'default' ? old : `go${version}`}${suffix}`);
}

export function syncGoModVersions({ envPath = 'compose/.env', repoDirectory = '.', check = false } = {}) {
  const { GO_VERSION: version } = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  validateVersion(version);
  const directory = resolveRepoPath(repoDirectory);
  // Validate all modules before writing any of them. Dependency and checksum locks are untouched.
  const results = goModules.map((module) => {
    const filePath = path.join(directory, module, 'go.mod');
    return readSyncFile(filePath, (existing) => syncGoModContent(existing, version), `${module}/go.mod`);
  });
  return finishSync(results, {
    check,
    description: 'Go module versions',
    scriptName: 'sync-go-mod-versions.mjs',
    displayPath: (filePath) => path.relative(directory, filePath),
  });
}

runSyncCli(import.meta.url, syncGoModVersions, 'Go modules');
