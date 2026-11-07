import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { formatImageTag, imageDefinitions, loadImageVariables } from './image-tags.mjs';
import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { syncComposeImageTags } from './sync-image-tags.mjs';

const variables = loadImageVariables(parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8')));

test('every IDE image matches its Compose service and shared build name', () => {
  const compose = ['compose/docker-compose.yml', 'compose/utils.yml'].map((file) => readFileSync(resolveRepoPath(file), 'utf8')).join('\n');
  let count = 0;
  for (const file of readdirSync(resolveRepoPath('.run')).filter((name) => name.startsWith('[build-img]'))) {
    const xml = readFileSync(resolveRepoPath(`.run/${file}`), 'utf8');
    const tag = xml.match(/name="imageTag" value="([^"]+)"/)?.[1];
    if (!tag || tag === 'wrk2:latest') continue;
    assert.ok(compose.includes(`image: ${tag}\n`), file);
    assert.equal(tag, formatImageTag(tag.split(':')[0], variables), file);
    const buildName = xml.match(/name="name" value="BUILDKIT_BUILD_NAME"\s*\/>\s*<option name="value" value="([^"]+)"/)?.[1];
    if (buildName) assert.ok(compose.includes(`BUILDKIT_BUILD_NAME: ${buildName}\n`), file);
    count += 1;
  }
  assert.equal(count, 28);
  const manifest = JSON.parse(readFileSync(resolveRepoPath('scripts/render-readmes.manifest.json'), 'utf8'));
  for (const file of manifest.defaultTemplatePaths) {
    const template = readFileSync(resolveRepoPath(file), 'utf8');
    for (const { name } of imageDefinitions) assert.ok(!template.includes(`${name}:latest`), `${file}: ${name}`);
  }
});

test('runtime changes distinguish tags while preserving framework versions and service identities', () => {
  const values = { ...variables, JAVA_MAJOR_VERSION: '27', NODE_MAJOR_VERSION: '28', PYTHON_VERSION: '3.14.1' };
  assert.equal(formatImageTag('quarkus-native', values), `quarkus-native:${variables.QUARKUS_VERSION}-java27`);
  assert.equal(formatImageTag('orchestrator', values), `orchestrator:${variables.QUARKUS_VERSION}-java27`);
  assert.equal(formatImageTag('django-platform', values), `django-platform:${variables.DJANGO_VERSION}-python3.14`);
  assert.equal(formatImageTag('nextjs-dash', values), `nextjs-dash:${variables.NEXTJS_VERSION}-node28`);
  assert.equal(formatImageTag('go', values), `go:${variables.GO_VERSION}`);
  assert.throws(() => formatImageTag('unknown', values), /Unknown managed image/);
  for (const invalid of ['25;echo', '25\n', '25.1']) {
    assert.throws(() => formatImageTag('quarkus-jvm', { ...values, JAVA_MAJOR_VERSION: invalid }), /Invalid|invalid/);
  }
});

test('Compose migration changes only managed image and build-name values, retaining unrelated pins and CRLF', () => {
  const original = '# keep\r\nservices:\r\n  quarkus-jvm:\r\n    image: quarkus-jvm:${QUARKUS_VERSION}_latest # comment\r\n    build:\r\n      args:\r\n        BUILDKIT_BUILD_NAME: quarkus-jvm:old\r\n    container_name: quarkus-jvm\r\n    mem_limit: 832M\r\n  wrk2:\r\n    image: wrk2:latest\r\n';
  const tag = formatImageTag('quarkus-jvm', variables);
  const expected = original.replace('quarkus-jvm:${QUARKUS_VERSION}_latest', tag).replace('quarkus-jvm:old', tag);
  assert.equal(syncComposeImageTags(original, variables), expected);
  assert.equal(syncComposeImageTags(expected, variables), expected);
});
