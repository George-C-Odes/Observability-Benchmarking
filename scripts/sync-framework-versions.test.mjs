import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { loadManifestTemplatePaths, parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { frameworkVersionKeys, generatedFrameworkPaths, syncPythonDefault, syncSonarPythonVersion } from './sync-framework-versions.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

test('canonical inventory covers exactly the active env version variables', () => {
  const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
  assert.deepEqual([...frameworkVersionKeys].sort(), Object.keys(variables).filter((key) => key.endsWith('_VERSION') && !key.startsWith('JAVA_')).sort());
  assert.equal(new Set(frameworkVersionKeys).size, 15);
});

test('Pekko build wiring forwards independent HTTP and Core versions to Maven', () => {
  const compose = readFileSync(resolveRepoPath('compose/docker-compose.yml'), 'utf8');
  const service = compose.slice(compose.indexOf('\n  pekko-jvm:'), compose.indexOf('\n  go:'));
  assert.match(service, /image: pekko-jvm:[\d.]+-java\d+/);
  const dockerfile = readFileSync(resolveRepoPath('services/java/pekko/jvm/Dockerfile'), 'utf8');
  for (const [key, property] of [['PEKKO_VERSION', 'pekko.version'], ['PEKKO_CORE_VERSION', 'pekko.core.version']]) {
    assert.ok(service.includes(`${key}: \${${key}}`), key);
    assert.equal(dockerfile.split(`-D${property}=\${${key}}`).length - 1, 2, 'Offline resolution and packaging must use the same pins');
  }
  const pom = readFileSync(resolveRepoPath('services/java/pekko/jvm/pom.xml'), 'utf8');
  for (const artifact of ['stream', 'slf4j']) {
    assert.match(pom, new RegExp(`<artifactId>pekko-${artifact}_3</artifactId>\\s*<version>\\$\\{pekko\\.core\\.version}</version>`));
  }
});

test('integration-test version reporting includes both Pekko release lines', () => {
  const runner = readFileSync(resolveRepoPath('integration-tests/run-integration-tests.sh'), 'utf8');
  const versions = runner.match(/load_versions\(\) \{[\s\S]*?for key in ([\s\S]*?); do/)[1];
  for (const key of ['PEKKO_VERSION', 'PEKKO_CORE_VERSION']) {
    assert.match(versions, new RegExp(`\\b${key}\\b`));
  }
});

test('Python runtime default follows the env without changing action pins or caller overrides', () => {
  const original = readFileSync(resolveRepoPath('.github/actions/setup-python/action.yml'), 'utf8');
  const updated = syncPythonDefault(original, '3.14.2');
  assert.equal(updated, original.replace(/default: '[^']+'/m, "default: '3.14.2'"));
  assert.equal(syncPythonDefault(updated, '3.14.2'), updated);
  assert.equal(syncPythonDefault(original.replaceAll('\n', '\r\n'), '3.14.2'), updated.replaceAll('\n', '\r\n'));
  assert.throws(() => syncPythonDefault(original, '3.14.2rc1'), /stable/);
  assert.throws(() => syncPythonDefault('name: invalid\n', '3.14.2'), /Missing/);
});

test('Sonar follows Python major/minor only, preserving encoding, scope, comments and CRLF', () => {
  const original = '# sonar.python.version=2.7\nsonar.python.version=3.13\nsonar.sourceEncoding=UTF-8\nsonar.exclusions=docs/vendor/**\n';
  const updated = original.replace('sonar.python.version=3.13', 'sonar.python.version=3.14');
  assert.equal(syncSonarPythonVersion(original, '3.14.2'), updated);
  assert.equal(syncSonarPythonVersion(updated, '3.14.99'), updated);
  assert.equal(syncSonarPythonVersion(original.replaceAll('\n', '\r\n'), '3.14.2'), updated.replaceAll('\n', '\r\n'));
  for (const invalid of [undefined, null, {}, '3.14', '3.14.2rc1', '3.14.2\n', '3.14.2\r\n', '3.14.2\nsonar.exclusions=**']) {
    assert.throws(() => syncSonarPythonVersion(original, invalid), /stable/);
    assert.throws(() => syncPythonDefault('', invalid), /stable/);
  }
  assert.throws(() => syncSonarPythonVersion('# sonar.python.version=3.13\n', '3.14.2'), /one Sonar/);
  assert.throws(() => syncSonarPythonVersion(`${original}sonar.python.version=3.12\n`, '3.14.2'), /one Sonar/);
  const checkedIn = readFileSync(resolveRepoPath('.sonarcloud.properties'), 'utf8');
  const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
  assert.equal(syncSonarPythonVersion(checkedIn, variables.PYTHON_VERSION), checkedIn);
  assert.match(checkedIn, /^sonar.sourceEncoding=UTF-8\r?$/m);
  assert.doesNotMatch(checkedIn, /^sonar\.(?:inclusions|sources|issue\.ignore|test\.exclusions)/m);
});

test('Sonar excludes only verified binary images and all other tracked files are valid UTF-8', () => {
  const config = readFileSync(resolveRepoPath('.sonarcloud.properties'), 'utf8');
  const matches = [...config.matchAll(/^sonar\.exclusions=([^\r\n]*)/gm)];
  assert.equal(matches.length, 1, 'Keep one reviewed source exclusion setting');
  const exclusions = matches[0][1].split(',');
  assert.deepEqual(exclusions, ['**/*.png', '**/*.ico'], 'Do not exclude source files or entire directories');
  const excluded = (file) => exclusions.some((pattern) => path.posix.matchesGlob(file, pattern));
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: resolveRepoPath('.'), encoding: 'utf8', timeout: 30_000 });
  assert.equal(tracked.status, 0, tracked.stderr);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const icoSignature = Buffer.from([0x00, 0x00, 0x01, 0x00]);
  let images = 0;
  for (const file of tracked.stdout.split('\0').filter(Boolean)) {
    const bytes = readFileSync(resolveRepoPath(file));
    if (excluded(file)) {
      const signature = file.endsWith('.png') ? pngSignature : icoSignature;
      assert.ok(bytes.subarray(0, signature.length).equals(signature), `Excluded file is not a verified image: ${file}`);
      images++;
      continue;
    }
    let text;
    assert.doesNotThrow(() => { text = decoder.decode(bytes); }, `Invalid UTF-8 in tracked text: ${file}`);
    assert.ok(!text.includes('\ufffd'), `Literal replacement character in ${file}; use an escape in intentional fixtures`);
    assert.ok(!text.includes('\0'), `Unexpected binary/NUL content in tracked text: ${file}`);
  }
  assert.ok(images > 0, 'Exercise actual binary assets, not just exclusion syntax');
  for (const file of [
    'docs/favicon.svg', 'utils/nextjs-dash/public/favicon.svg', 'scripts/renovate-framework-sync.mjs',
    'services/python/django/gunicorn/common/src/obbench_django_common/views.py',
    'services/go/simple/cmd/server/main.go', 'utils/nextjs-dash/app/page.tsx', '.sonarcloud.properties',
  ]) assert.equal(excluded(file), false, `Text source must remain in scope: ${file}`);
});

test('Sonar classifies tracked non-Java tests and helpers without excluding production roots', () => {
  const config = readFileSync(resolveRepoPath('.sonarcloud.properties'), 'utf8');
  const values = new Map(config.split(/\r?\n/).filter((line) => line.startsWith('sonar.')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  const roots = values.get('sonar.tests').split(',');
  const patterns = values.get('sonar.test.inclusions').split(',');
  assert.ok(roots.every((root) => root && !/[*?\\]/.test(root)), 'Candidate roots must be literal repo paths');
  for (const root of roots) {
    const entry = statSync(resolveRepoPath(root));
    assert.ok(entry.isDirectory() || entry.isFile(), `Missing candidate root: ${root}`);
  }
  const isTest = (file) => roots.some((root) => file === root || file.startsWith(`${root}/`))
    && patterns.some((pattern) => path.posix.matchesGlob(file, pattern));
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: resolveRepoPath('.'), encoding: 'utf8', timeout: 30_000 });
  assert.equal(tracked.status, 0, tracked.stderr);
  const tests = tracked.stdout.split('\0').filter((file) => file.endsWith('.test.mjs') || file.endsWith('_test.go')
    || (file.endsWith('.py') && (path.posix.basename(file).startsWith('test_') || file.includes('/tests/')))
    || file.startsWith('utils/nextjs-dash/__tests__/'));
  assert.ok(tests.length > 50, 'Verify a nonempty multi-language inventory');
  for (const file of [...tests, 'scripts/test-helpers.mjs', 'utils/nextjs-dash/vitest.setup.ts']) {
    assert.ok(isTest(file), `Unclassified test/helper: ${file}`);
  }
  for (const file of [
    'scripts/renovate-framework-sync.mjs', 'scripts/sync-framework-versions.mjs', 'scripts/run-qodana-python.py',
    'integration-tests/results.py', 'services/python/django/gunicorn/sync_build_locks.py',
    'services/python/django/gunicorn/common/src/obbench_django_common/views.py',
    'services/python/django/gunicorn/WSGI/src/manage.py', 'services/go/simple/cmd/server/main.go',
    'services/go/enhanced/internal/handlers/hello.go', 'utils/nextjs-dash/app/page.tsx',
  ]) assert.equal(isTest(file), false, `Production path must not be a test: ${file}`);
  for (const file of tracked.stdout.split('\0').filter((file) => file.includes('/src/main/java/') && file.endsWith('.java'))) {
    assert.equal(isTest(file), false, `Java production path must not be a test: ${file}`);
  }
  assert.ok(roots.every((root) => !root.startsWith('services/java') && !root.startsWith('utils/orchestrator')),
    'Java keeps automatic Maven/Gradle classification');
  assert.equal(syncSonarPythonVersion(config, '3.14.99'), config.replace(/^sonar.python.version=.*$/m, 'sonar.python.version=3.14'));
});

test('generated allowlist includes all target classes, but never scripts or source templates', () => {
  const files = generatedFrameworkPaths();
  assert.equal(new Set(files).size, files.length);
  for (const file of [
    'utils/orchestrator/pom.xml', '.github/actions/setup-python/action.yml', '.sonarcloud.properties',
    '.github/go-tools/go.mod', 'services/python/django/gunicorn/dependencies.lock',
    'README.md', 'services/java/quarkus/native/pom.xml', '.github/requirements/python-ci.txt',
    'services/java/vertx/jvm/README.md',
    'services/java/pekko/jvm/README.md',
  ]) assert.ok(files.includes(file), file);
  assert.ok(files.some((file) => file.startsWith('.run/[build-img]')));
  assert.ok(files.every((file) => !file.includes('\\') && !file.includes('..') && !file.includes('.template.') && !file.startsWith('scripts/')));
  for (const file of files) assert.ok(readFileSync(resolveRepoPath(file)).length, file);
});

test('complete CLI relays changed env values, detects drift read-only, and is repeatable', (t) => {
  const workspace = temporaryDirectory(t, 'framework-pipeline-');
  const scripts = [
    'sync-nextjs-tags.mjs', 'sync-framework-versions.mjs', 'sync-django-versions.mjs', 'sync-java-pom-versions.mjs',
    'sync-dockerfile-versions.mjs', 'sync-go-mod-versions.mjs', 'sync-build-img-runs.mjs',
    'image-tags.mjs', 'sync-image-tags.mjs', 'sync-node-versions.mjs', 'sync-java-runtime-versions.mjs', 'sync-common.mjs', 'render-readmes.mjs', 'render-readmes.manifest.json',
  ];
  const files = [...new Set([
    'compose/.env', 'utils/nextjs-dash/package.json', ...generatedFrameworkPaths(), ...loadManifestTemplatePaths('scripts/render-readmes.manifest.json'),
    ...scripts.map((file) => `scripts/${file}`),
  ])];
  for (const file of files) {
    const target = path.join(workspace, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(resolveRepoPath(file), target);
  }
  const envPath = path.join(workspace, 'compose/.env');
  const source = readFileSync(envPath, 'utf8')
    .replace(/^JAVA_MAJOR_VERSION:.*$/m, 'JAVA_MAJOR_VERSION: 26')
    .replace(/^JAVA_MINOR_PATCH_VERSION:.*$/m, 'JAVA_MINOR_PATCH_VERSION: 1.2.3.4')
    .replace(/^QUARKUS_VERSION:.*$/m, 'QUARKUS_VERSION: 9.0.1')
    .replace(/^VERTX_VERSION:.*$/m, 'VERTX_VERSION: 9.0.2')
    .replace(/^DROPWIZARD_VERSION:.*$/m, 'DROPWIZARD_VERSION: 9.1.2')
    .replace(/^PEKKO_VERSION:.*$/m, 'PEKKO_VERSION: 9.0.3')
    .replace(/^PEKKO_CORE_VERSION:.*$/m, 'PEKKO_CORE_VERSION: 9.0.4')
    .replace(/^NODE_MAJOR_VERSION:.*$/m, 'NODE_MAJOR_VERSION: 28')
    .replace(/^NODE_MINOR_PATCH_VERSION:.*$/m, 'NODE_MINOR_PATCH_VERSION: 1.2')
    .replace(/^GO_VERSION:.*$/m, 'GO_VERSION: 1.99.0')
    .replace(/^PYTHON_VERSION:.*$/m, 'PYTHON_VERSION: 3.14.99');
  writeFileSync(envPath, source);
  const snapshot = () => files.map((file) => readFileSync(path.join(workspace, file), 'utf8'));
  const before = snapshot();
  const run = (...args) => spawnSync(process.execPath, [path.join(workspace, 'scripts/sync-framework-versions.mjs'), ...args], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
  const stale = run('--check');
  assert.equal(stale.status, 1, stale.stderr);
  assert.deepEqual(snapshot(), before);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(envPath, 'utf8'), source);
  assert.match(readFileSync(path.join(workspace, 'utils/orchestrator/pom.xml'), 'utf8'), /<quarkus.platform.version>9\.0\.1/);
  assert.match(readFileSync(path.join(workspace, 'services/java/quarkus/native/pom.xml'), 'utf8'), /<quarkus.platform.version>9\.0\.1/);
  assert.match(readFileSync(path.join(workspace, '.github/go-tools/go.mod'), 'utf8'), /^go 1\.99\.0/m);
  assert.match(readFileSync(path.join(workspace, '.github/actions/setup-python/action.yml'), 'utf8'), /default: '3\.14\.99'/);
  assert.equal(readFileSync(path.join(workspace, '.sonarcloud.properties'), 'utf8'),
    readFileSync(resolveRepoPath('.sonarcloud.properties'), 'utf8').replace(/^sonar.python.version=.*$/m, 'sonar.python.version=3.14'));
  assert.match(readFileSync(path.join(workspace, 'services/python/django/gunicorn/WSGI/Dockerfile'), 'utf8'), /ARG PYTHON_VERSION=3\.14\.99/);
  assert.match(readFileSync(path.join(workspace, 'services/README.md'), 'utf8'), /9\.0\.1/);
  const vertxReadme = readFileSync(path.join(workspace, 'services/java/vertx/jvm/README.md'), 'utf8');
  assert.match(vertxReadme, /\*\*Eclipse Vert\.x 9\.0\.2\*\*/);
  assert.match(vertxReadme, /--build-arg VERTX_VERSION=9\.0\.2/);
  assert.doesNotMatch(vertxReadme, /\{\{VERTX_VERSION}}/);
  const dropwizardReadme = readFileSync(path.join(workspace, 'services/java/dropwizard/jvm/README.md'), 'utf8');
  assert.match(dropwizardReadme, /--build-arg DROPWIZARD_VERSION=9\.1\.2/);
  assert.match(dropwizardReadme, /dropwizard-jvm:9\.1\.2-java26/);
  assert.doesNotMatch(readFileSync(path.join(workspace, 'README.md'), 'utf8'), /Eclipse Temurin 26\.1\.2\.3\.4/);
  const pekkoPom = readFileSync(path.join(workspace, 'services/java/pekko/jvm/pom.xml'), 'utf8');
  assert.match(pekkoPom, /<pekko.version>9\.0\.3<\/pekko.version>/);
  assert.match(pekkoPom, /<pekko.core.version>9\.0\.4<\/pekko.core.version>/);
  const pekkoDockerfile = readFileSync(path.join(workspace, 'services/java/pekko/jvm/Dockerfile'), 'utf8');
  assert.match(pekkoDockerfile, /ARG PEKKO_VERSION=9\.0\.3/);
  assert.match(pekkoDockerfile, /ARG PEKKO_CORE_VERSION=9\.0\.4/);
  const pekkoBuild = readFileSync(path.join(workspace, '.run/[build-img] Pekko JVM.run.xml'), 'utf8');
  assert.match(pekkoBuild, /name="imageTag" value="pekko-jvm:9\.0\.3-java26"/);
  assert.match(pekkoBuild, /name="name" value="PEKKO_CORE_VERSION"\s*\/>\s*<option name="value" value="9\.0\.4"/);
  for (const file of ['README.md', 'docs/benchmarking.md', 'docs/tools-technologies.md', 'services/java/pekko/jvm/README.md']) {
    const content = readFileSync(path.join(workspace, file), 'utf8');
    assert.match(content, /Pekko HTTP[^\r\n]*9\.0\.3/, file);
    assert.match(content, /Pekko Core 9\.0\.4/, file);
    assert.doesNotMatch(content, /\{\{PEKKO(?:_CORE)?_VERSION}}/, file);
  }
  for (const file of ['services/java/spring/native/netty/pom.xml', 'utils/orchestrator/pom.xml']) {
    assert.match(readFileSync(path.join(workspace, file), 'utf8'), /<maven.compiler.release>26<\/maven.compiler.release>/);
  }
  const nativeDocker = readFileSync(path.join(workspace, 'services/java/quarkus/native/Dockerfile'), 'utf8');
  assert.match(nativeDocker, /^ARG JAVA_RELEASE=26$/m);
  assert.match(nativeDocker, /^ARG JAVA_MINOR_RELEASE=\.1\.2\.3\.4$/m);
  assert.match(readFileSync(path.join(workspace, 'README.md'), 'utf8'), /Java-26-ED8B00/);
  assert.match(readFileSync(path.join(workspace, 'docs/index.html'), 'utf8'), /native-image:26\.1\.2\.3\.4-ol9/);
  assert.match(readFileSync(path.join(workspace, '.github/workflows/codeql.yml'), 'utf8'), /java-version: '26'/);
  assert.match(readFileSync(path.join(workspace, 'qodana.yaml'), 'utf8'), /projectJDK: "26"/);
  assert.match(readFileSync(path.join(workspace, '.idea/misc.xml'), 'utf8'), /languageLevel="JDK_26"/);
  assert.match(readFileSync(path.join(workspace, 'services/java/helidon/mp/native/pom.xml'), 'utf8'), /<graalvm.version>26\.1\.2\.3\.4<\/graalvm.version>/);
  assert.match(readFileSync(path.join(workspace, 'utils/nextjs-dash/Dockerfile'), 'utf8'), /node:28\.1\.2-alpine/);
  assert.match(readFileSync(path.join(workspace, '.github/actions/setup-nextjs/action.yml'), 'utf8'), /default: '28\.1\.2'/);
  assert.match(readFileSync(path.join(workspace, 'compose/utils.yml'), 'utf8'), /nextjs-dash:16\.4\.5-node28/);
  assert.match(readFileSync(path.join(workspace, 'compose/docker-compose.yml'), 'utf8'), /django-platform:6\.1\.3-python3\.14/);
  const generated = snapshot();
  assert.equal(run('--check').status, 0);
  const repeat = run();
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.match(repeat.stdout, /0 updated/);
  assert.deepEqual(snapshot(), generated);
  // Exercise the dependency upgrade generator used by the trusted npm relay.
  const manifestPath = path.join(workspace, 'utils/nextjs-dash/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies.next = '99.1.2';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const nextRun = (...args) => spawnSync(process.execPath,
    [path.join(workspace, 'scripts/sync-nextjs-tags.mjs'), ...args],
    { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
  assert.equal(nextRun('--check').status, 1);
  const nextResult = nextRun();
  assert.equal(nextResult.status, 0, nextResult.stderr);
  const ideFiles = files.filter((file) => file.startsWith('.run/')
    && readFileSync(path.join(workspace, file), 'utf8').includes('nextjs-dash:'));
  assert.ok(ideFiles.length > 0);
  for (const file of ['compose/utils.yml', ...ideFiles, 'utils/nextjs-dash/README.md']) {
    assert.match(readFileSync(path.join(workspace, file), 'utf8'), /nextjs-dash:99\.1\.2-node28/, file);
  }
  const nextSnapshot = snapshot();
  assert.equal(nextRun('--check').status, 0);
  assert.equal(nextRun().status, 0);
  assert.deepEqual(snapshot(), nextSnapshot);

});

