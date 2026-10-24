import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';

// Only framework/runtime ARG defaults backed by compose/.env are managed.
export const dockerfileVersions = [
  { key: 'SPRING_BOOT_VERSION', modules: ['java/spring/jvm', 'java/spring/native'] },
  { key: 'QUARKUS_VERSION', modules: ['java/quarkus/jvm', 'java/quarkus/native'] },
  { key: 'MICRONAUT_VERSION', modules: ['java/micronaut/jvm', 'java/micronaut/native'] },
  { key: 'HELIDON_VERSION', modules: ['java/helidon/mp/jvm', 'java/helidon/mp/native', 'java/helidon/se/jvm', 'java/helidon/se/native'] },
  { key: 'SPARK_VERSION', modules: ['java/spark/jvm'] },
  { key: 'JAVALIN_VERSION', modules: ['java/javalin/jvm'] },
  { key: 'DROPWIZARD_VERSION', modules: ['java/dropwizard/jvm'] },
  { key: 'VERTX_VERSION', modules: ['java/vertx/jvm'] },
  { key: 'PEKKO_VERSION', modules: ['java/pekko/jvm'] },
  { key: 'GO_VERSION', modules: ['go/enhanced', 'go/simple'] },
  { key: 'PYTHON_VERSION', modules: ['python/django/gunicorn/ASGI', 'python/django/gunicorn/WSGI'] },
];

function readVersion(variables, key) {
  const version = Object.hasOwn(variables, key) ? variables[key] : '';
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(version)) {
    throw new Error(`Missing or invalid version ${key} in the env file (expected an unquoted literal version)`);
  }
  return version;
}

export function syncDockerfileContent(content, key, version) {
  if (!/^[A-Z][A-Z0-9_]*_VERSION$/.test(key)) throw new Error(`Invalid version argument: ${key}`);
  readVersion({ [key]: version }, key);
  // Match complete ARG defaults, leaving comments, bare stage redeclarations and other pins intact.
  const pattern = new RegExp(`^([\\t ]*ARG[\\t ]+${key}[\\t ]*=[\\t ]*)([^\\t \\r\\n#]+)([\\t ]*(?:#[^\\r\\n]*)?\\r?)$`, 'gmi');
  const declarations = [...content.matchAll(pattern)];
  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one ARG ${key} default, found ${declarations.length}`);
  }
  return content.replace(pattern, (_match, prefix, _oldVersion, suffix) => `${prefix}${version}${suffix}`);
}

export function syncDockerfileVersions({ envPath = 'compose/.env', servicesDirectory = 'services', check = false } = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  const directory = resolveRepoPath(servicesDirectory);
  // Validate the entire inventory before writing any Dockerfile.
  const results = dockerfileVersions.flatMap(({ key, modules }) => {
    const version = readVersion(variables, key);
    return modules.map((module) => {
      const filePath = path.join(directory, module, 'Dockerfile');
      try {
        const existing = readFileSync(filePath, 'utf8');
        const content = syncDockerfileContent(existing, key, version);
        return { filePath, content, changed: content !== existing };
      } catch (error) {
        throw new Error(`${module}/Dockerfile: ${error.message}`, { cause: error });
      }
    });
  });

  const changed = results.filter((result) => result.changed);
  if (check && changed.length > 0) {
    throw new Error(`Dockerfile versions are out of date. Run node scripts/sync-dockerfile-versions.mjs:\n${changed.map(({ filePath }) => path.relative(directory, filePath)).join('\n')}`);
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
        console.log('Usage: node scripts/sync-dockerfile-versions.mjs [--env path/to/.env] [--check]');
        return;
      default:
        throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  const results = syncDockerfileVersions({ envPath, check });
  for (const { filePath, changed } of results) {
    if (changed) console.log(`Updated ${path.relative(resolveRepoPath('.'), filePath)}`);
  }
  console.log(`Checked ${results.length} Dockerfiles; ${results.filter(({ changed }) => changed).length} updated.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
