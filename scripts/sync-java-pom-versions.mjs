import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';

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

function readVersion(variables, key) {
  const version = Object.hasOwn(variables, key) ? variables[key] : '';
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(version)) {
    throw new Error(`Missing or invalid version ${key} in the env file (expected an unquoted literal version)`);
  }
  return version;
}

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
    const version = readVersion(variables, key);
    return modules.map((module) => {
      const filePath = path.join(directory, module, 'pom.xml');
      try {
        const existing = readFileSync(filePath, 'utf8');
        const content = syncJavaPomXml(existing, property, version);
        return { filePath, content, changed: content !== existing };
      } catch (error) {
        throw new Error(`${module}/pom.xml: ${error.message}`, { cause: error });
      }
    });
  });

  const changed = results.filter((result) => result.changed);
  if (check && changed.length > 0) {
    throw new Error(`Java POM versions are out of date. Run node scripts/sync-java-pom-versions.mjs:\n${changed.map(({ filePath }) => path.relative(directory, filePath)).join('\n')}`);
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
        console.log('Usage: node scripts/sync-java-pom-versions.mjs [--env path/to/.env] [--check]');
        return;
      default:
        throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  const results = syncJavaPomVersions({ envPath, check });
  for (const { filePath, changed } of results) {
    if (changed) console.log(`Updated ${path.relative(resolveRepoPath('.'), filePath)}`);
  }
  console.log(`Checked ${results.length} Java POMs; ${results.filter(({ changed }) => changed).length} updated.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
