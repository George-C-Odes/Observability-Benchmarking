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

function parseGoDirective(line) {
  const prefix = /^[\t ]*(go|toolchain)[\t ]+/.exec(line);
  if (!prefix) return undefined;
  // Consume the token separately so malformed suffixes cannot backtrack into it.
  const token = /^[^/\t \r\n]+/.exec(line.slice(prefix[0].length));
  if (!token) return undefined;
  const suffix = line.slice(prefix[0].length + token[0].length);
  const tail = suffix.replace(/^[\t ]*/, '');
  if (tail !== '' && !tail.startsWith('//')) return undefined;
  return { directive: prefix[1], prefix: prefix[0], version: token[0], suffix };
}

export function syncGoModContent(content, version) {
  validateVersion(version);
  // Keep line separators verbatim; each line is parsed without whole-line backtracking.
  const lines = content.split(/(\r\n|[\r\n\u2028\u2029])/);
  const directives = lines.map(parseGoDirective);
  const declarations = directives.filter((match) => match?.directive === 'go');
  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one go directive, found ${declarations.length}`);
  }
  const toolchains = directives.filter((match) => match?.directive === 'toolchain');
  if (toolchains.length > 1 || toolchains.some((match) => !/^(?:default|go1\.\d+(?:\.\d+)?)$/.test(match.version))) {
    throw new Error('Expected at most one standard Go toolchain directive or toolchain default');
  }
  return lines.map((line, index) => {
    const match = directives[index];
    if (!match) return line;
    let replacement = version;
    if (match.directive === 'toolchain') {
      replacement = match.version === 'default' ? 'default' : `go${version}`;
    }
    return `${match.prefix}${replacement}${match.suffix}`;
  }).join('');
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
