import { readFileSync } from 'node:fs';
import path from 'node:path';

// Renovate's pip_requirements manager edits pins in the compiled runtime locks
// but cannot regenerate the hashed CI inventory, Docker projections, or docs.
// This relay accepts only pin-version edits, then reproduces them with the
// trusted, hash-locked pip-compile before regenerating everything downstream.
const root = 'services/python/django/gunicorn';
export const pythonRuntimeLocks = ['WSGI', 'ASGI'].map((variant) => `${root}/${variant}/requirements.txt`);
export const pythonLockLabel = 'python-lock';

// Pinned from compose/.env and relayed through the framework-version route.
const envManagedPackages = new Set(['django', 'gunicorn', 'ruff']);
// Leading alphanumeric: a name can never be read as a pip-compile option.
const packageNamePattern = /^[a-z0-9][a-z0-9._-]*$/;
// PEP 440 release, optional pre-release and post-release; no local or dev versions.
const versionPattern = /^\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?$/;
const pinLinePattern = /^([A-Za-z0-9][A-Za-z0-9._-]*)==(\S+)/;

// The single runtime-lock invocation shared with the framework-version route.
// Committed locks must be in exactly this command's Linux output form (header
// and `--only-binary :all:` option line), or a pin-only proposal cannot match.
// pip-tools omits --upgrade-package from the header, so the selectors are safe.
export function runtimeLockCompileArgs(lockFile, upgradePackages = []) {
  return ['-m', 'piptools', 'compile', '--strip-extras',
    ...upgradePackages.flatMap((selector) => ['--upgrade-package', selector]),
    '--pip-args=--only-binary :all:', `--output-file=${lockFile}`, lockFile.replace(/requirements\.txt$/, 'requirements.in')];
}

function normalizeName(name) {
  return name.toLowerCase().replaceAll(/[-_.]+/g, '-');
}

function readPins(content, file) {
  const pins = new Map();
  const masked = content.split('\n').map((line) => {
    const match = pinLinePattern.exec(line);
    if (!match) return line;
    const name = normalizeName(match[1]);
    if (pins.has(name)) throw new Error(`Duplicate ${name} pin in ${file}`);
    pins.set(name, match[2]);
    return `${match[1]}==<version>${line.slice(match[0].length)}`;
  }).join('\n');
  return { pins, masked };
}

function changedPins(file, base, proposed) {
  const original = readPins(base, file);
  const updated = readPins(proposed, file);
  if (original.masked !== updated.masked) {
    throw new Error(`Renovate may change only existing pin versions in ${file}`);
  }
  return [...updated.pins].filter(([name, version]) => original.pins.get(name) !== version).map(([name, version]) => {
    if (!packageNamePattern.test(name) || !versionPattern.test(version)) {
      throw new Error(`Expected a released package version: ${name}==${version} in ${file}`);
    }
    if (envManagedPackages.has(name)) {
      throw new Error(`${name} is pinned from compose/.env; update it through the framework-version route`);
    }
    return { file, packageName: name, from: original.pins.get(name), to: version };
  });
}

// base and proposed map each runtime lock path to its content.
export function validatePythonLockChange(base, proposed) {
  for (const files of [base, proposed]) {
    const keys = Object.keys(files).toSorted((left, right) => left.localeCompare(right));
    const expected = pythonRuntimeLocks.toSorted((left, right) => left.localeCompare(right));
    if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error('Expected exactly the Django runtime locks');
    if (Object.values(files).some((content) => typeof content !== 'string')) throw new Error('Expected lock file contents');
  }
  return pythonRuntimeLocks.flatMap((file) => changedPins(file, base[file], proposed[file]));
}

// run(command, args, workspace) must execute without a shell (runCompiler does).
export function regeneratePythonRuntimeLocks(proposed, { workspace, run }) {
  const read = (file) => readFileSync(path.join(workspace, file), 'utf8');
  // The trusted checkout holds the base locks; revalidate rather than trust stored state.
  const changes = validatePythonLockChange(Object.fromEntries(pythonRuntimeLocks.map((file) => [file, read(file)])), proposed);
  for (const file of pythonRuntimeLocks) {
    const upgrades = changes.filter((change) => change.file === file);
    if (!upgrades.length) continue;
    run('python', runtimeLockCompileArgs(file, upgrades.map(({ packageName, to }) => `${packageName}==${to}`)), workspace);
    if (read(file) !== proposed[file]) {
      throw new Error(`Renovate's ${file} differs from trusted pip-compile regeneration; regenerate the Python locks manually`);
    }
  }
  if (changes.length) run('bash', ['.github/requirements/update-lock.sh'], workspace);
  return changes;
}
