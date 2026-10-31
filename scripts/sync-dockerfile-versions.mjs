import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readLiteralVersion, readSyncFile, runSyncCli } from './sync-common.mjs';

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

export function syncDockerfileContent(content, key, version) {
  if (!/^[A-Z][A-Z0-9_]*_VERSION$/.test(key)) throw new Error(`Invalid version argument: ${key}`);
  readLiteralVersion({ [key]: version }, key);
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
    const version = readLiteralVersion(variables, key);
    return modules.map((module) => {
      const filePath = path.join(directory, module, 'Dockerfile');
      return readSyncFile(filePath, (existing) => syncDockerfileContent(existing, key, version), `${module}/Dockerfile`);
    });
  });

  return finishSync(results, {
    check,
    description: 'Dockerfile versions',
    scriptName: 'sync-dockerfile-versions.mjs',
    displayPath: (filePath) => path.relative(directory, filePath),
  });
}

runSyncCli(import.meta.url, syncDockerfileVersions, 'Dockerfiles');
