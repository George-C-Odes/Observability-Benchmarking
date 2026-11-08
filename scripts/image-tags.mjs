import { readFileSync } from 'node:fs';

import { readLiteralVersion } from './sync-common.mjs';

export const imageDefinitions = [
  ...[
    ['SPRING_BOOT_VERSION', ['spring-jvm-tomcat-platform', 'spring-jvm-tomcat-virtual', 'spring-jvm-netty', 'spring-native-tomcat-platform', 'spring-native-tomcat-virtual', 'spring-native-netty', 'spring-jvm-tomcat']],
    ['QUARKUS_VERSION', ['quarkus-jvm', 'quarkus-native', 'orchestrator']],
    ['MICRONAUT_VERSION', ['micronaut-jvm', 'micronaut-native']],
    ['HELIDON_VERSION', ['helidon-se-jvm', 'helidon-se-native', 'helidon-mp-jvm', 'helidon-mp-native']],
    ['SPARK_VERSION', ['spark-jvm-platform', 'spark-jvm-virtual', 'spark-jvm']],
    ['JAVALIN_VERSION', ['javalin-jvm-platform', 'javalin-jvm-virtual', 'javalin-jvm']],
    ['DROPWIZARD_VERSION', ['dropwizard-jvm-platform', 'dropwizard-jvm-virtual', 'dropwizard-jvm']],
    ['VERTX_VERSION', ['vertx-jvm']],
    ['PEKKO_VERSION', ['pekko-jvm']],
  ].flatMap(([key, names]) => names.map((name) => ({ name, key, runtime: 'java' }))),
  ...['go', 'go-simple'].map((name) => ({ name, key: 'GO_VERSION' })),
  ...['django-platform', 'django-reactive'].map((name) => ({ name, key: 'DJANGO_VERSION', runtime: 'python' })),
  { name: 'nextjs-dash', key: 'NEXTJS_VERSION', runtime: 'node' },
];

export function imageVariableName(name) {
  return `${name.replaceAll('-', '_').toUpperCase()}_IMAGE`;
}

export function formatImageTag(name, variables) {
  const definition = imageDefinitions.find((entry) => entry.name === name);
  if (!definition) throw new Error(`Unknown managed image: ${name}`);
  const version = readLiteralVersion(variables, definition.key);
  let suffix = '';
  if (definition.runtime === 'java' || definition.runtime === 'node') {
    const key = `${definition.runtime.toUpperCase()}_MAJOR_VERSION`;
    const major = readLiteralVersion(variables, key);
    if (!/^[1-9]\d*$/.test(major)) throw new Error(`Invalid runtime major: ${key}`);
    suffix = `-${definition.runtime}${major}`;
  } else if (definition.runtime === 'python') {
    const python = readLiteralVersion(variables, 'PYTHON_VERSION');
    const match = /^(\d+\.\d+)\.\d+$/.exec(python);
    if (!match) throw new Error('PYTHON_VERSION must be a stable X.Y.Z release');
    suffix = `-python${match[1]}`;
  }
  const tag = `${version}${suffix}`;
  if (tag.length > 128) throw new Error(`Image tag exceeds 128 characters: ${name}`);
  return `${name}:${tag}`;
}

export function loadImageVariables(variables) {
  // Next.js retains its existing package.json source of truth; never duplicate its pin in the env.
  const manifest = JSON.parse(readFileSync(new URL('../utils/nextjs-dash/package.json', import.meta.url), 'utf8'));
  return { ...variables, NEXTJS_VERSION: manifest.dependencies.next };
}

export function imageTemplateVariables(variables) {
  const values = loadImageVariables(variables);
  // Small renderer fixtures can supply only the variables used by their templates.
  for (const { name, key, runtime } of imageDefinitions) {
    const runtimeKey = runtime === 'python' ? 'PYTHON_VERSION' : `${runtime?.toUpperCase()}_MAJOR_VERSION`;
    if (values[key] && (!runtime || values[runtimeKey])) {
      values[imageVariableName(name)] = formatImageTag(name, values);
    }
  }
  return values;
}
