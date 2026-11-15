import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { projectForScope, scopeProject } from './qodana-project.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

const entries = ['utils/orchestrator/pom.xml', 'services/java/example/jvm/pom.xml', 'services/java/example/native/pom.xml'];
const xml = `<project><component name="MavenProjectsManager"><option name="originalFiles"><list>${entries.map((path) => `<option value="$PROJECT_DIR$/${path}" />`).join('\n')}</list></option></component><component name="NullableNotNullManager"><option name="keep" value="yes"/></component></project>`;

test('import scoping preserves all selected variants and unrelated IDE settings byte for byte', () => {
  for (const scope of ['utils/orchestrator', 'services/java']) {
    const poms = entries.filter((path) => path.startsWith(`${scope}/`)).map((path) => `$PROJECT_DIR$/${path}`);
    const result = projectForScope(xml, poms, scope);
    for (const path of entries) assert.equal(result.includes(`$PROJECT_DIR$/${path}`), path.startsWith(`${scope}/`));
    assert.ok(result.includes('<component name="NullableNotNullManager"><option name="keep" value="yes"/></component>'));
    assert.equal(projectForScope(result, poms, scope), result, 'Idempotent import generation');
  }
});

test('missing, stale, duplicate, unsupported or entity-based inventories fail closed', () => {
  const poms = ['$PROJECT_DIR$/utils/orchestrator/pom.xml'];
  for (const input of ['', xml.replace('originalFiles', 'other'), xml.replace('<list>', '<list><unexpected/>'),
    xml.replace('</list>', '<option value="$PROJECT_DIR$/utils/orchestrator/pom.xml"/></list>'),
    `<!DOCTYPE project [<!ENTITY x "test">]>${xml}`]) assert.throws(() => projectForScope(input, poms, 'utils/orchestrator'));
  assert.throws(() => projectForScope(xml, [...poms, '$PROJECT_DIR$/utils/orchestrator/new/pom.xml'], 'utils/orchestrator'));
  assert.throws(() => projectForScope(xml, [], '../outside'));
});

test('filesystem inventory ignores build outputs and rejects omissions before writing', (t) => {
  const root = temporaryDirectory(t, 'qodana-project-');
  mkdirSync(join(root, '.idea'));
  const config = join(root, '.idea/misc.xml');
  writeFileSync(config, xml);
  mkdirSync(join(root, 'utils/orchestrator/target/generated'), { recursive: true });
  writeFileSync(join(root, 'utils/orchestrator/pom.xml'), '<project/>');
  writeFileSync(join(root, 'utils/orchestrator/target/generated/pom.xml'), '<project/>');
  assert.equal(scopeProject(root, 'utils/orchestrator'), 1);
  const before = readFileSync(config, 'utf8');
  mkdirSync(join(root, 'utils/orchestrator/new'));
  writeFileSync(join(root, 'utils/orchestrator/new/pom.xml'), '<project/>');
  assert.throws(() => scopeProject(root, 'utils/orchestrator'));
  assert.equal(readFileSync(config, 'utf8'), before);
});

test('pinned image bootstrap selects its bundled Maven without wrapper network dependencies', () => {
  const config = readFileSync(new URL('../qodana.yaml', import.meta.url), 'utf8');
  assert.match(config, /BUNDLED_MVN=\/opt\/idea\/plugins\/maven-plugin\/lib\/maven3\/bin\/mvn/);
  assert.match(config, /if \[ -x "\$BUNDLED_MVN" ]; then\n +MVN_BIN=\$BUNDLED_MVN/);
  assert.doesNotMatch(config, /FALLBACK_MVNW|chmod \+x/);
  assert.match(config, /echo 'Qodana bootstrap: no Maven distribution available[^\n]+\n +exit 1/);
});
