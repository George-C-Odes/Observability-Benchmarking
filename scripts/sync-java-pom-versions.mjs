import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readLiteralVersion, readSyncFile, runSyncCli } from './sync-common.mjs';

// Paths are relative to services/java. Only these framework properties are managed.
export const javaFrameworkVersions = [
  { key: 'SPRING_BOOT_VERSION', property: 'spring-boot.version', modules: ['spring/jvm/netty', 'spring/jvm/tomcat', 'spring/native/netty', 'spring/native/tomcat'] },
  { key: 'QUARKUS_VERSION', property: 'quarkus.platform.version', modules: ['quarkus/jvm', 'quarkus/native'] },
  { key: 'MICRONAUT_VERSION', property: 'micronaut.version', modules: ['micronaut/jvm', 'micronaut/native'] },
  { key: 'HELIDON_VERSION', property: 'helidon.version', modules: ['helidon/mp/jvm', 'helidon/mp/native', 'helidon/se/jvm', 'helidon/se/native'] },
  { key: 'SPARK_VERSION', property: 'spark-core.version', modules: ['spark/jvm'] },
  { key: 'JAVALIN_VERSION', property: 'javalin.version', modules: ['javalin/jvm'] },
  { key: 'DROPWIZARD_VERSION', property: 'dropwizard.version', modules: ['dropwizard/jvm'] },
  { key: 'VERTX_VERSION', property: 'vertx.version', modules: ['vertx/jvm'] },
  { key: 'PEKKO_VERSION', property: 'pekko.version', modules: ['pekko/jvm'] },
];

export function syncJavaPomXml(xml, property, version) {
  if (!/^[a-z][a-z0-9.-]*$/.test(property)) throw new Error(`Invalid Maven property: ${property}`);
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(version)) {
    throw new Error(`Invalid version for ${property}`);
  }

  // Mask comments without moving offsets, so commented examples cannot be updated.
  const activeXml = xml.replace(/<!--[\s\S]*?-->/g, (comment) => ' '.repeat(comment.length));
  const escapedProperty = property.replaceAll('.', '\\.');
  const pattern = new RegExp(`<${escapedProperty}>(\\s*)([^<]*?)(\\s*)<\\/${escapedProperty}\\s*>`, 'g');
  const declarations = [];
  for (const block of activeXml.matchAll(/<properties\s*>[\s\S]*?<\/properties\s*>/g)) {
    for (const match of block[0].matchAll(pattern)) {
      declarations.push({ match, offset: block.index + match.index });
    }
  }
  if (declarations.length !== 1) {
    throw new Error(`Expected exactly one ${property} declaration in POM properties, found ${declarations.length}`);
  }
  const { match, offset } = declarations[0];
  const valueStart = offset + `<${property}>`.length + match[1].length;
  if (xml.slice(valueStart, valueStart + match[2].length).includes('<')) {
    throw new Error(`Expected a literal ${property} value without embedded XML`);
  }
  return xml.slice(0, valueStart) + version + xml.slice(valueStart + match[2].length);
}

export function syncJavaPomVersions({ envPath = 'compose/.env', javaDirectory = 'services/java', check = false } = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  const directory = resolveRepoPath(javaDirectory);

  // Read and validate the whole batch before writing any POM.
  const results = javaFrameworkVersions.flatMap(({ key, property, modules }) => {
    const version = readLiteralVersion(variables, key);
    return modules.map((module) => {
      const filePath = path.join(directory, module, 'pom.xml');
      return readSyncFile(filePath, (existing) => syncJavaPomXml(existing, property, version), `${module}/pom.xml`);
    });
  });

  return finishSync(results, {
    check,
    description: 'Java POM versions',
    scriptName: 'sync-java-pom-versions.mjs',
    displayPath: (filePath) => path.relative(directory, filePath),
  });
}

runSyncCli(import.meta.url, syncJavaPomVersions, 'Java POMs');
