import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseColonEnv, resolveRepoPath } from './render-readmes.mjs';
import { readLiteralVersion, runSyncCli } from './sync-common.mjs';

const root = 'services/python/django/gunicorn';
export const djangoInputs = ['WSGI', 'ASGI'].map((variant) => `${root}/${variant}/requirements.in`);
export const djangoLocks = [
  ...['WSGI', 'ASGI'].map((variant) => `${root}/${variant}/requirements.txt`),
  '.github/requirements/python-ci.txt',
  `${root}/dependencies.lock`,
];
export const djangoGeneratedFiles = [
  ...djangoInputs, ...djangoLocks, '.github/requirements/pip.txt',
  `${root}/build-requirements.txt`, `${root}/pip-requirements.txt`,
];

const pythonFrameworks = [
  { name: 'Django', packageName: 'django', key: 'DJANGO_VERSION' },
  { name: 'Gunicorn', packageName: 'gunicorn', key: 'GUNICORN_VERSION' },
];

function pinInput(content, version, { name, packageName, key }) {
  readLiteralVersion({ [key]: version }, key);
  const pattern = new RegExp(String.raw`^([\t ]*${packageName})(?:==|>=)[^\s#]+([\t ]*(?:#[^\r\n]*)?\r?)$`, 'gmi');
  if ([...content.matchAll(pattern)].length !== 1) {
    throw new Error(`Expected exactly one active ${name} requirement`);
  }
  return content.replace(pattern, (_match, prefix, suffix) => `${prefix}==${version}${suffix}`);
}

function lockedVersion(content, { name, packageName }) {
  const pins = [...content.matchAll(new RegExp(String.raw`^${packageName}==([^\s\\]+)(?:[\t ]|\r?$)`, 'gmi'))];
  if (pins.length !== 1) throw new Error(`Expected exactly one locked ${name} version`);
  return pins[0][1];
}

export function pinDjangoInput(content, version) {
  return pinInput(content, version, pythonFrameworks[0]);
}

export function lockedDjangoVersion(content) {
  return lockedVersion(content, pythonFrameworks[0]);
}

export function pinGunicornInput(content, version) {
  return pinInput(content, version, pythonFrameworks[1]);
}

export function lockedGunicornVersion(content) {
  return lockedVersion(content, pythonFrameworks[1]);
}

export function runCompiler(command, args, workspace) {
  const result = spawnSync(command, args, {
    cwd: workspace, stdio: 'inherit', timeout: 10 * 60 * 1000, shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Lock regeneration failed (${command}); use Linux with Python and pip-tools 7.6.2`, { cause: result.error });
  }
}

function regenerateDjangoLocks(versions, changedFrameworks, workspace, run) {
  for (const variant of ['WSGI', 'ASGI']) {
    run('python', ['-m', 'piptools', 'compile', '--strip-extras',
      ...changedFrameworks.flatMap(({ packageName }) => ['--upgrade-package', packageName]),
      '--pip-args=--only-binary :all:', `--output-file=${root}/${variant}/requirements.txt`,
      `${root}/${variant}/requirements.in`], workspace);
  }
  run('bash', ['.github/requirements/update-lock.sh'], workspace);
  for (const file of djangoLocks) {
    const content = readFileSync(path.join(workspace, file), 'utf8');
    for (const framework of pythonFrameworks) {
      if (lockedVersion(content, framework) !== versions[framework.key]) {
        throw new Error(`${framework.name} lock regeneration did not propagate ${versions[framework.key]}: ${file}`);
      }
    }
  }
}

export function syncDjangoVersions({
  envPath = 'compose/.env', workspace = resolveRepoPath('.'), check = false, run = runCompiler,
} = {}) {
  const variables = parseColonEnv(readFileSync(resolveRepoPath(envPath), 'utf8'));
  const versions = Object.fromEntries(pythonFrameworks.map(({ key }) => [key, readLiteralVersion(variables, key)]));
  const files = djangoGeneratedFiles.map((file) => {
    const filePath = path.join(workspace, file);
    const original = readFileSync(filePath, 'utf8');
    const content = djangoInputs.includes(file)
      ? pythonFrameworks.reduce((input, framework) => pinInput(input, versions[framework.key], framework), original)
      : original;
    return { filePath, original, content };
  });
  const changedFrameworks = pythonFrameworks.filter((framework) => djangoLocks.some((file) =>
    lockedVersion(files.find(({ filePath }) => filePath === path.join(workspace, file)).original, framework) !== versions[framework.key]));
  const staleLocks = changedFrameworks.length > 0;
  if (check) {
    if (staleLocks || files.some(({ original, content }) => original !== content)) {
      throw new Error('Django/Gunicorn versions are out of date. Run node scripts/sync-framework-versions.mjs on Linux with pip-tools 7.6.2');
    }
  } else {
    // Check the compiler before changing inputs. Never substitute a version into existing hashes.
    if (staleLocks) run('python', ['-m', 'piptools', 'compile', '--version'], workspace);
    for (const { filePath, original, content } of files) {
      if (original !== content) writeFileSync(filePath, content, 'utf8');
    }
    if (staleLocks) regenerateDjangoLocks(versions, changedFrameworks, workspace, run);
  }
  return files.map(({ filePath, original }) => {
    const content = readFileSync(filePath, 'utf8');
    return { filePath, content, changed: original !== content };
  });
}

runSyncCli(import.meta.url, syncDjangoVersions, 'Django/Gunicorn version files');
