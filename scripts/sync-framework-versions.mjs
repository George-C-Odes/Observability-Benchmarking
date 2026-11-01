import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { deriveOutputPath, loadManifestTemplatePaths, parseColonEnv, renderTemplates, resolveRepoPath } from './render-readmes.mjs';
import { syncBuildImageRuns } from './sync-build-img-runs.mjs';
import { finishSync, readLiteralVersion, readSyncFile, runSyncCli } from './sync-common.mjs';
import { djangoGeneratedFiles, syncDjangoVersions } from './sync-django-versions.mjs';
import { dockerfileVersions, syncDockerfileVersions } from './sync-dockerfile-versions.mjs';
import { goModules, syncGoModVersions } from './sync-go-mod-versions.mjs';
import { javaFrameworkVersions, syncJavaPomVersions, syncJavaPomXml } from './sync-java-pom-versions.mjs';

export const frameworkVersionKeys = [...dockerfileVersions.map(({ key }) => key), 'DJANGO_VERSION'];
const controlPom = 'utils/orchestrator/pom.xml';
const pythonAction = '.github/actions/setup-python/action.yml';

export function syncPythonDefault(content, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('PYTHON_VERSION must be a stable X.Y.Z release');
  const pattern = /(^ {2}python-version:\r?\n[\s\S]*?^ {4}default: )'[^']+'(?=\r?$)/m;
  if (!pattern.test(content)) throw new Error('Missing shared Python version default');
  return content.replace(pattern, (_match, prefix) => `${prefix}'${version}'`);
}

export function generatedFrameworkPaths() {
  return [
    ...javaFrameworkVersions.flatMap(({ modules }) => modules.map((module) => `services/java/${module}/pom.xml`)),
    ...dockerfileVersions.flatMap(({ modules }) => modules.map((module) => `services/${module}/Dockerfile`)),
    ...goModules.map((module) => `${module}/go.mod`),
    ...readdirSync(resolveRepoPath('.run')).filter((file) => file.startsWith('[build-img]') && file.endsWith('.run.xml')).map((file) => `.run/${file}`),
    ...loadManifestTemplatePaths('scripts/render-readmes.manifest.json').map((file) => deriveOutputPath(file).replaceAll('\\', '/')),
    ...djangoGeneratedFiles, controlPom, pythonAction,
  ];
}

export function syncFrameworkVersions({ envPath = 'compose/.env', check = false } = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  for (const key of frameworkVersionKeys) readLiteralVersion(variables, key);
  const extra = [
    readSyncFile(resolveRepoPath(controlPom), (content) => syncJavaPomXml(content, 'quarkus.platform.version', variables.QUARKUS_VERSION), controlPom),
    readSyncFile(resolveRepoPath(pythonAction), (content) => syncPythonDefault(content, variables.PYTHON_VERSION), pythonAction),
  ];
  const results = [
    ...syncDjangoVersions({ envPath, check }),
    ...syncJavaPomVersions({ envPath, check }),
    ...syncGoModVersions({ envPath, check }),
    ...syncDockerfileVersions({ envPath, check }),
    ...syncBuildImageRuns({ envPath, check }),
    ...finishSync(extra, { check, description: 'Control-plane/CI versions', scriptName: 'sync-framework-versions.mjs', displayPath: (file) => path.relative(resolveRepoPath('.'), file) }),
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
