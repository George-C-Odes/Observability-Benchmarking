import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';

// Django images are tagged with the framework version, but built with Python's version.
const imageVersionOverrides = {
  'django-platform': 'DJANGO_VERSION',
  'django-reactive': 'DJANGO_VERSION',
};
const versionNotice = '  <!-- Versions: compose/.env; refresh with node scripts/sync-build-img-runs.mjs -->';

function findOption(xml, name) {
  const options = [...xml.matchAll(new RegExp(`<option\\s+name="${name}"[^>]*\\/>`, 'g'))];
  if (options.length !== 1) {
    throw new Error(`Expected exactly one ${name} option, found ${options.length}`);
  }
  const option = options[0][0];
  const value = option.match(/\bvalue="([^"]*)"/);
  if (!value) throw new Error(`Missing value attribute for ${name}`);
  return { option, value: value[1] };
}

function setOption(xml, name, value) {
  const { option } = findOption(xml, name);
  return xml.replace(option, () => option.replace(/\bvalue="[^"]*"/, () => `value="${value}"`));
}

function readVersion(variables, key) {
  const value = Object.hasOwn(variables, key) ? variables[key] : '';
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || `${value}_latest`.length > 128) {
    throw new Error(`Missing or invalid version ${key} in the env file (expected an unquoted Docker tag version)`);
  }
  return value;
}

function replaceTagVersion(tag, version) {
  const match = tag.match(/^(.+):[^:]*_latest$/);
  if (!match) throw new Error(`Expected a versioned image tag ending in _latest: ${tag}`);
  return `${match[1]}:${version}_latest`;
}

export function syncBuildImageXml(xml, variables) {
  // The cache-prune Shell Script configuration has no image or build arguments.
  if (!/<configuration\b[^>]*\btype="docker-deploy"/.test(xml)) return xml;
  if (!/<deployment\s+type="dockerfile"/.test(xml)) {
    throw new Error('Expected a Dockerfile build configuration');
  }

  const imageTag = findOption(xml, 'imageTag').value;
  const buildArgs = xml.match(/<option\s+name="buildArgs">\s*<list>[\s\S]*?<\/list>\s*<\/option>/)?.[0];
  const args = [...(buildArgs ?? '').matchAll(/<DockerEnvVarImpl>[\s\S]*?<\/DockerEnvVarImpl>/g)]
    .map(([block]) => ({ block, name: findOption(block, 'name').value }));
  const versionArgs = args.filter(({ name }) => name.endsWith('_VERSION'));

  if (versionArgs.length === 0 && imageTag.endsWith(':latest')) return xml;
  if (versionArgs.length === 0) throw new Error('Versioned image has no *_VERSION build argument');

  const imageName = imageTag.slice(0, imageTag.lastIndexOf(':'));
  const versionKey = Object.hasOwn(imageVersionOverrides, imageName)
    ? imageVersionOverrides[imageName]
    : versionArgs.length === 1 ? versionArgs[0].name : null;
  if (!versionKey) throw new Error(`Ambiguous image version for ${imageName}; add an imageVersionOverrides entry`);

  const imageVersion = readVersion(variables, versionKey);
  let updatedArgs = buildArgs;
  for (const { block, name } of args) {
    let value;
    if (name.endsWith('_VERSION')) {
      value = readVersion(variables, name);
    } else if (name === 'BUILDKIT_BUILD_NAME') {
      // Some variants intentionally share a build name, such as spark-jvm.
      value = replaceTagVersion(findOption(block, 'value').value, imageVersion);
    } else {
      continue;
    }
    updatedArgs = updatedArgs.replace(block, () => setOption(block, 'value', value));
  }

  let updated = xml.replace(buildArgs, () => updatedArgs);
  updated = setOption(updated, 'imageTag', replaceTagVersion(imageTag, imageVersion));
  if (!updated.includes(versionNotice)) {
    const newline = updated.includes('\r\n') ? '\r\n' : '\n';
    updated = updated.replace(/<component\b[^>]*>/, (component) => `${component}${newline}${versionNotice}`);
  }
  return updated;
}

export function syncBuildImageRuns({ envPath = 'compose/.env', runDirectory = '.run', check = false } = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  const directory = resolveRepoPath(runDirectory);
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('[build-img]') && entry.name.endsWith('.run.xml'))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) throw new Error(`No [build-img] run configurations found in ${directory}`);

  // Validate every configuration before writing, so a missing version cannot leave a partial update.
  const results = files.map((file) => {
    const filePath = path.join(directory, file);
    const existing = readFileSync(filePath, 'utf8');
    try {
      const content = syncBuildImageXml(existing, variables);
      return { filePath, content, changed: content !== existing };
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  });

  const changed = results.filter((result) => result.changed);
  if (check && changed.length > 0) {
    throw new Error(`Build image run configurations are out of date. Run node scripts/sync-build-img-runs.mjs:\n${changed.map(({ filePath }) => path.basename(filePath)).join('\n')}`);
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
        console.log('Usage: node scripts/sync-build-img-runs.mjs [--env path/to/.env] [--check]');
        return;
      default:
        throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  const results = syncBuildImageRuns({ envPath, check });
  for (const { filePath, changed } of results) {
    if (changed) console.log(`Updated ${path.basename(filePath)}`);
  }
  console.log(`Checked ${results.length} build image run configurations; ${results.filter(({ changed }) => changed).length} updated.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
