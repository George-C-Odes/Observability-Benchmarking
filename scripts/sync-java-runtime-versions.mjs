import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { finishSync, readSyncFile, runSyncCli } from './sync-common.mjs';
import { javaFrameworkVersions, syncJavaPomXml } from './sync-java-pom-versions.mjs';

// Deliberately separate from frameworkVersionKeys: Java upgrades are manual.
export const javaRuntimeVersionKeys = ['JAVA_MAJOR_VERSION', 'JAVA_MINOR_PATCH_VERSION'];
const modules = [...new Set(javaFrameworkVersions.flatMap(({ modules }) => modules))];
const dockerfiles = [...new Set(modules.map((module) => `services/java/${module.replace(/\/(netty|tomcat)$/, '')}/Dockerfile`)), 'utils/orchestrator/Dockerfile'];
const poms = [...modules.map((module) => `services/java/${module}/pom.xml`), 'utils/orchestrator/pom.xml'];
const workflows = ['codeql', 'java_coverage', 'pmd', 'snyk-security'].map((name) => `.github/workflows/${name}.yml`);
export const javaRuntimeGeneratedPaths = [...poms, ...dockerfiles, ...workflows, '.idea/misc.xml', 'qodana.yaml'];

export function readJavaRuntimeVersion(variables) {
  const major = variables.JAVA_MAJOR_VERSION;
  const minorPatch = variables.JAVA_MINOR_PATCH_VERSION;
  if (typeof major !== 'string' || !/^[1-9]\d*$/.test(major) || /\s/.test(major)) {
    throw new Error('JAVA_MAJOR_VERSION must be a positive integer');
  }
  if (typeof minorPatch !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(minorPatch) || /\s/.test(minorPatch)) {
    throw new Error('JAVA_MINOR_PATCH_VERSION must contain two to four dot-separated numeric components');
  }
  return { major, minorPatch, full: `${major}.${minorPatch}` };
}

export function syncJavaRuntimeContent(content, file, version) {
  const { major, minorPatch, full } = version;
  if (file.endsWith('/pom.xml')) {
    let updated = syncJavaPomXml(content, 'maven.compiler.release', major);
    if (/<java\.version>/.test(updated)) updated = syncJavaPomXml(updated, 'java.version', major);
    if (file === 'services/java/helidon/mp/native/pom.xml') {
      updated = syncJavaPomXml(updated, 'graalvm.version', full);
    }
    return updated;
  }
  if (file.endsWith('/Dockerfile')) {
    if (!/^ARG JAVA_RELEASE=\d+\r?$/m.test(content)) throw new Error('Missing JAVA_RELEASE default');
    return content
      .replace(/^(ARG JAVA_RELEASE=)\d+(\r?)$/gm, `$1${major}$2`)
      .replace(/^(ARG JAVA_MINOR_RELEASE=)\.\d+(?:\.\d+){1,3}(\r?)$/gm, `$1.${minorPatch}$2`)
      .replace(/(eclipse-temurin-)\d+(-noble)(?:@sha256:[a-f0-9]+)?/g, (match, prefix, suffix) => {
        // JAVA_MINOR_PATCH_VERSION selects the native-image release, not the Temurin patch.
        // JVM patches (including jlink runtimes) are selected by the builder digest.
        // A major change drops the digest; refresh it explicitly before benchmarking.
        if (match.startsWith(`${prefix}${major}${suffix}`)) return match;
        return `${prefix}${major}${suffix}`;
      })
      // Corretto selects its own JVM patch; the native-image release does not apply.
      .replace(/(amazoncorretto:)\d+(?:\.\d+){0,4}(?=[-\s"'@]|$)/g, `$1${major}`);
  }
  if (file === 'qodana.yaml') {
    if (!/projectJDK: "\d+"/.test(content)) throw new Error('Missing Qodana project JDK');
    return content.replace(/(projectJDK: ")\d+(")/g, `$1${major}$2`);
  }
  if (file.endsWith('.yml')) {
    if (!/java-version: '\d+'/.test(content)) throw new Error('Missing Java CI version');
    return content.replace(/(java-version: ')\d+(')/g, `$1${major}$2`)
      .replace(/(JDK )\d+/g, `$1${major}`)
      .replace(/(maven\.compiler\.release=)\d+/g, `$1${major}`);
  }
  if (file === '.idea/misc.xml') {
    return content.replace(/(languageLevel="JDK_)\d+/g, `$1${major}`)
      .replace(/(project-jdk-name="temurin-)\d+/g, `$1${major}`);
  }
  throw new Error(`Unsupported Java runtime file: ${file}`);
}

export function syncJavaRuntimeVersions({ envPath = 'compose/.env', check = false } = {}) {
  const version = readJavaRuntimeVersion(parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8')));
  const results = javaRuntimeGeneratedPaths.map((file) => readSyncFile(resolveRepoPath(file),
    (content) => syncJavaRuntimeContent(content, file, version), file));
  return finishSync(results, { check, description: 'Java runtime versions', scriptName: 'sync-java-runtime-versions.mjs',
    displayPath: (file) => path.relative(resolveRepoPath('.'), file) });
}

runSyncCli(import.meta.url, syncJavaRuntimeVersions, 'Java runtime version files');
