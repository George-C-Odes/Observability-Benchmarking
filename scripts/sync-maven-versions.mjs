import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readSyncFile, runSyncCli } from './sync-common.mjs';
import { dockerfileVersions } from './sync-dockerfile-versions.mjs';

const javaModules = [...new Set(dockerfileVersions.flatMap(({ modules }) => modules).filter((module) => module.startsWith('java/')))];
export const mavenGeneratedPaths = [
  ...javaModules.filter((module) => module.endsWith('/jvm')).map((module) => `services/${module}/Dockerfile`),
  ...javaModules.filter((module) => module.endsWith('/native')).map((module) => `services/${module}/.mvn/wrapper/maven-wrapper.properties`),
  'utils/orchestrator/Dockerfile',
];

export function readMavenVersion(variables) {
  const version = variables.MAVEN_VERSION;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || /\s/.test(version)) {
    throw new Error('MAVEN_VERSION must be a stable X.Y.Z release');
  }
  return version;
}

export function syncMavenContent(content, file, version) {
  readMavenVersion({ MAVEN_VERSION: version });
  let pattern;
  let replace;
  if (file.endsWith('/maven-wrapper.properties')) {
    pattern = /^(distributionUrl=https:\/\/repo\.maven\.apache\.org\/maven2\/org\/apache\/maven\/apache-maven\/)\d+\.\d+\.\d+\/apache-maven-\d+\.\d+\.\d+-bin\.zip(\r?)$/gm;
    replace = (_match, prefix, suffix) => `${prefix}${version}/apache-maven-${version}-bin.zip${suffix}`;
  } else if (file === 'utils/orchestrator/Dockerfile') {
    pattern = /^(ARG IMAGE_BUILDER=maven:)(\d+\.\d+\.\d+)(-eclipse-temurin-\d+-noble)(@sha256:[a-f0-9]{64})?(\r?)$/gm;
    // A digest selects the old image even after a tag change. Retain it only for the same release.
    replace = (_match, prefix, old, suffix, digest, ending) => `${prefix}${version}${suffix}${old === version ? digest ?? '' : ''}${ending}`;
  } else if (file.endsWith('/Dockerfile')) {
    pattern = /^(ARG MAVEN_RELEASE=)\d+\.\d+\.\d+(\r?)$/gm;
    replace = (_match, prefix, suffix) => `${prefix}${version}${suffix}`;
  } else {
    throw new Error(`Unsupported Maven version file: ${file}`);
  }
  if ([...content.matchAll(pattern)].length !== 1) throw new Error('Expected exactly one Maven version declaration');
  return content.replace(pattern, replace);
}

export function syncMavenVersions({ envPath = 'compose/.env', check = false } = {}) {
  const version = readMavenVersion(parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8')));
  const results = mavenGeneratedPaths.map((file) => readSyncFile(resolveRepoPath(file),
    (content) => syncMavenContent(content, file, version), file));
  return finishSync(results, { check, description: 'Maven versions', scriptName: 'sync-maven-versions.mjs',
    displayPath: (file) => path.relative(resolveRepoPath('.'), file) });
}

runSyncCli(import.meta.url, syncMavenVersions, 'Maven version files');
