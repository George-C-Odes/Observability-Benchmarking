import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { deriveOutputPath, loadManifestTemplatePaths, parseColonEnv, renderTemplates, resolveRepoPath } from './render-readmes.mjs';
import { syncBuildImageRuns } from './sync-build-img-runs.mjs';
import { finishSync, readLiteralVersion, readSyncFile, runSyncCli } from './sync-common.mjs';
import { djangoGeneratedFiles, syncDjangoVersions } from './sync-django-versions.mjs';
import { dockerfileVersions, syncDockerfileVersions } from './sync-dockerfile-versions.mjs';
import { imageTagGeneratedPaths, syncImageTags } from './sync-image-tags.mjs';
import { nodeGeneratedPaths, nodeVersionKeys, syncNodeVersions } from './sync-node-versions.mjs';
import { goModules, syncGoModVersions } from './sync-go-mod-versions.mjs';
import { javaRuntimeGeneratedPaths, syncJavaRuntimeVersions } from './sync-java-runtime-versions.mjs';
import { javaFrameworkVersions, syncJavaPomVersions, syncJavaPomXml } from './sync-java-pom-versions.mjs';
import { dashboardPackageVersions } from './image-tags.mjs';

export const frameworkVersionKeys = [...dockerfileVersions.map(({ key }) => key), 'DJANGO_VERSION', ...nodeVersionKeys];
const controlPom = 'utils/orchestrator/pom.xml';
const pythonAction = '.github/actions/setup-python/action.yml';
const sonarConfig = '.sonarcloud.properties';

function pythonLanguageVersion(version) {
  const match = typeof version === 'string' && /^(\d+\.\d+)\.\d+$/.exec(version);
  if (!match || match[0] !== version) throw new Error('PYTHON_VERSION must be a stable X.Y.Z release');
  return match[1];
}

export function syncPythonDefault(content, version) {
  pythonLanguageVersion(version);
  const pattern = /(^ {2}python-version:\r?\n[\s\S]*?^ {4}default: )'[^']+'(?=\r?$)/m;
  if (!pattern.test(content)) throw new Error('Missing shared Python version default');
  return content.replace(pattern, (_match, prefix) => `${prefix}'${version}'`);
}

export function syncSonarPythonVersion(content, version) {
  const languageVersion = pythonLanguageVersion(version);
  const pattern = /(^[ \t]*sonar\.python\.version[ \t]*=[ \t]*)[^\r\n]*/gm;
  if ([...content.matchAll(pattern)].length !== 1) throw new Error('Expected one Sonar Python version setting');
  // Sonar accepts X.Y, not the runtime patch release. Preserve every other setting.
  return content.replace(pattern, (_match, prefix) => `${prefix}${languageVersion}`);
}

export function generatedFrameworkPaths() {
  return [...new Set([
    ...javaFrameworkVersions.flatMap(({ modules }) => modules.map((module) => `services/java/${module}/pom.xml`)),
    ...dockerfileVersions.flatMap(({ modules }) => modules.map((module) => `services/${module}/Dockerfile`)),
    ...goModules.map((module) => `${module}/go.mod`),
    ...readdirSync(resolveRepoPath('.run')).filter((file) => file.startsWith('[build-img]') && file.endsWith('.run.xml')).map((file) => `.run/${file}`),
    ...loadManifestTemplatePaths('scripts/render-readmes.manifest.json').map((file) => deriveOutputPath(file).replaceAll('\\', '/')),
    ...imageTagGeneratedPaths, ...nodeGeneratedPaths, ...javaRuntimeGeneratedPaths, ...djangoGeneratedFiles, controlPom, pythonAction, sonarConfig,
  ])];
}

export function generatedNextjsPaths() {
  return generatedFrameworkPaths().filter((file) => file === 'compose/utils.yml'
    || (file.startsWith('.run/') && readFileSync(resolveRepoPath(file), 'utf8').includes('nextjs-dash:'))
    || loadManifestTemplatePaths('scripts/render-readmes.manifest.json').some((template) =>
      deriveOutputPath(template).replaceAll('\\', '/') === file
      && ['NEXTJS_DASH_IMAGE', ...dashboardPackageVersions.map(([key]) => key)].some((key) =>
        readFileSync(resolveRepoPath(template), 'utf8').includes(`{{${key}}}`))));
}

export function syncFrameworkVersions({ envPath = 'compose/.env', check = false } = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  for (const key of frameworkVersionKeys) readLiteralVersion(variables, key);
  const extra = [
    readSyncFile(resolveRepoPath(controlPom), (content) => syncJavaPomXml(content, 'quarkus.platform.version', variables.QUARKUS_VERSION), controlPom),
    readSyncFile(resolveRepoPath(pythonAction), (content) => syncPythonDefault(content, variables.PYTHON_VERSION), pythonAction),
    readSyncFile(resolveRepoPath(sonarConfig), (content) => syncSonarPythonVersion(content, variables.PYTHON_VERSION), sonarConfig),
  ];
  const results = [
    ...syncDjangoVersions({ envPath, check }),
    ...syncJavaPomVersions({ envPath, check }),
    ...syncGoModVersions({ envPath, check }),
    ...syncDockerfileVersions({ envPath, check }),
    ...syncNodeVersions({ envPath, check }),
    ...syncImageTags({ envPath, check }),
    ...syncBuildImageRuns({ envPath, check }),
    ...finishSync(extra, { check, description: 'Control-plane/CI versions', scriptName: 'sync-framework-versions.mjs', displayPath: (file) => path.relative(resolveRepoPath('.'), file) }),
    ...syncJavaRuntimeVersions({ envPath, check }),
  ];
  const templatePaths = loadManifestTemplatePaths('scripts/render-readmes.manifest.json');
  const before = new Map(templatePaths.map((file) => {
    const output = resolveRepoPath(deriveOutputPath(file));
    try {
      return [output, readFileSync(output, 'utf8')];
    } catch (error) {
      if (error.code !== 'ENOENT' || check) throw error;
      return [output, undefined];
    }
  }));
  for (const { outputPath } of renderTemplates({ envPath, templatePaths, check })) {
    const content = readFileSync(outputPath, 'utf8');
    results.push({ filePath: outputPath, content, changed: before.get(outputPath) !== content });
  }
  return results;
}

runSyncCli(import.meta.url, syncFrameworkVersions, 'framework version files');
