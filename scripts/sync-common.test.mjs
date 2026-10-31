import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { dockerfileVersions } from './sync-dockerfile-versions.mjs';
import { goModules } from './sync-go-mod-versions.mjs';
import { javaFrameworkVersions } from './sync-java-pom-versions.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

const commands = [
  {
    script: 'sync-build-img-runs.mjs',
    description: 'Build image run configurations',
    files: readdirSync(resolveRepoPath('.run'))
      .filter((file) => file.startsWith('[build-img]') && file.endsWith('.run.xml'))
      .map((file) => `.run/${file}`),
  },
  {
    script: 'sync-dockerfile-versions.mjs',
    description: 'Dockerfile versions',
    files: dockerfileVersions.flatMap(({ modules }) => modules.map((module) => `services/${module}/Dockerfile`)),
  },
  {
    script: 'sync-go-mod-versions.mjs',
    description: 'Go module versions',
    files: goModules.map((module) => `${module}/go.mod`),
  },
  {
    script: 'sync-java-pom-versions.mjs',
    description: 'Java POM versions',
    files: javaFrameworkVersions.flatMap(({ modules }) => modules.map((module) => `services/java/${module}/pom.xml`)),
  },
];

for (const { script, description, files } of commands) {
  test(`${script}: CLI options, custom env from another cwd, and read-only drift detection`, (t) => {
    const directory = temporaryDirectory(t, 'sync-cli-');
    const run = (...args) => spawnSync(process.execPath, [resolveRepoPath(`scripts/${script}`), ...args], {
      cwd: directory,
      encoding: 'utf8',
    });
    for (const flag of ['--help', '-h']) {
      const help = run(flag);
      assert.equal(help.status, 0, help.stderr);
      assert.equal(help.stdout.trim(), `Usage: node scripts/${script} [--env path/to/.env] [--check]`);
    }
    for (const args of [['--unknown'], ['--env'], ['--env', '--check']]) {
      const result = run(...args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown argument|Expected a path after --env/);
    }

    const variables = parseColonEnv(readFileSync(resolveRepoPath('compose/.env'), 'utf8'));
    const envPath = path.join(directory, '.env');
    writeFileSync(envPath, Object.keys(variables).filter((key) => key.endsWith('_VERSION'))
      .map((key) => `${key}: ${key === 'GO_VERSION' ? '1.99.0' : '91.3.5'}`).join('\n'));
    const readFiles = () => files.map((file) => readFileSync(resolveRepoPath(file), 'utf8'));
    const originals = readFiles();
    for (const args of [['--env', envPath, '--check'], ['--check', '--env', envPath]]) {
      const result = run(...args);
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`${description} are out of date. Run node scripts/${script}:`), result.stderr);
      assert.equal(result.stdout, '');
      assert.deepEqual(readFiles(), originals);
    }
  });
}
