import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';

export const goModules = ['services/go/enhanced', 'services/go/simple', '.github/go-tools'];

function validateVersion(version) {
  if (typeof version !== 'string' || !/^1\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version)) {
    throw new Error('Missing or invalid GO_VERSION in the env file (expected an unquoted stable version such as 1.27.3)');
  }
}

export function syncGoModContent(content, version) {
  validateVersion(version);
  const goPattern = /^([\t ]*go[\t ]+)([^\t \r\n]+)([\t ]*(?:\/\/[^\r\n]*)?\r?)$/gm;
  const declarations = [...content.matchAll(goPattern)];
  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one go directive, found ${declarations.length}`);
  }
  const toolchainPattern = /^([\t ]*toolchain[\t ]+)([^\t \r\n]+)([\t ]*(?:\/\/[^\r\n]*)?\r?)$/gm;
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
    try {
      const existing = readFileSync(filePath, 'utf8');
      const content = syncGoModContent(existing, version);
      return { filePath, content, changed: content !== existing };
    } catch (error) {
      throw new Error(`${module}/go.mod: ${error.message}`, { cause: error });
    }
  });
  const changed = results.filter((result) => result.changed);
  if (check && changed.length > 0) {
    throw new Error(`Go module versions are out of date. Run node scripts/sync-go-mod-versions.mjs:\n${changed.map(({ filePath }) => path.relative(directory, filePath)).join('\n')}`);
  }
  if (!check) {
    for (const { filePath, content } of changed) writeFileSync(filePath, content, 'utf8');
  }
  return results;
}

function main() {
  let envPath = 'compose/.env';
  let check = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    switch (args[index]) {
      case '--env':
        envPath = args[++index];
        if (!envPath || envPath.startsWith('--')) throw new Error('Expected a path after --env');
        break;
      case '--check':
        check = true;
        break;
      case '--help':
      case '-h':
        console.log('Usage: node scripts/sync-go-mod-versions.mjs [--env path/to/.env] [--check]');
        return;
      default:
        throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  const results = syncGoModVersions({ envPath, check });
  for (const { filePath, changed } of results) {
    if (changed) console.log(`Updated ${path.relative(resolveRepoPath('.'), filePath)}`);
  }
  console.log(`Checked ${results.length} Go modules; ${results.filter(({ changed }) => changed).length} updated.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
