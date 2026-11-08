import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { formatImageTag, imageDefinitions, loadImageVariables } from './image-tags.mjs';
import { finishSync, readLiteralVersion, readSyncFile, runSyncCli } from './sync-common.mjs';

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

function replaceImageTag(tag, variables) {
  const name = tag.slice(0, tag.lastIndexOf(':'));
  return formatImageTag(name, variables);
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
  const imageName = imageTag.slice(0, imageTag.lastIndexOf(':'));
  if (!imageDefinitions.some(({ name }) => name === imageName)) {
    if (imageName === 'wrk2' && imageTag === 'wrk2:latest') return xml;
    throw new Error(`Unknown managed image: ${imageName}`);
  }
  const values = loadImageVariables(variables);
  const updatedTag = replaceImageTag(imageTag, values);
  let updatedArgs = buildArgs;
  for (const { block, name } of args) {
    let value;
    if (name.endsWith('_VERSION')) {
      value = readLiteralVersion(values, name);
    } else if (name === 'BUILDKIT_BUILD_NAME') {
      // Some variants intentionally share a build name, such as spark-jvm.
      value = replaceImageTag(findOption(block, 'value').value, values);
    } else {
      continue;
    }
    updatedArgs = updatedArgs.replace(block, () => setOption(block, 'value', value));
  }

  let updated = xml.replace(buildArgs, () => updatedArgs);
  updated = setOption(updated, 'imageTag', updatedTag);
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
    return readSyncFile(filePath, (existing) => syncBuildImageXml(existing, variables), file);
  });

  return finishSync(results, {
    check,
    description: 'Build image run configurations',
    scriptName: 'sync-build-img-runs.mjs',
    displayPath: path.basename,
  });
}

runSyncCli(import.meta.url, syncBuildImageRuns, 'build image run configurations', path.basename);
