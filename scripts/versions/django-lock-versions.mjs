// The compiled ASGI runtime lock is the documented source for Python packages
// whose installed version is resolved by pip-compile. GUNICORN_VERSION remains
// pinned from compose/.env; docs read the locked result and reject drift.
export const djangoAsgiLock = 'services/python/django/gunicorn/ASGI/requirements.txt';

export const djangoLockedDocVersions = [
  { key: 'CACHETOOLS_VERSION', packageName: 'cachetools' },
  { key: 'GUNICORN_VERSION', packageName: 'gunicorn' },
];

const pinLinePattern = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s\\]+)/gm;
const stableVersionPattern = /^\d+\.\d+\.\d+$/;

export function readLockedPackageVersion(content, packageName) {
  const pins = [...content.matchAll(pinLinePattern)]
    .filter(([, name]) => name.toLowerCase() === packageName);
  if (pins.length !== 1 || !stableVersionPattern.test(pins[0][2])) {
    throw new Error(`Expected one stable exact ${packageName}==X.Y.Z pin in ${djangoAsgiLock}`);
  }
  return pins[0][2];
}

export function djangoLockTemplateVariables(keys, readSource, variables = {}) {
  const wanted = djangoLockedDocVersions.filter(({ key }) => keys.has(key));
  if (!wanted.length) return {};
  const content = readSource(djangoAsgiLock);
  return Object.fromEntries(wanted.map(({ key, packageName }) => {
    const version = readLockedPackageVersion(content, packageName);
    const pinned = variables[key];
    if (pinned !== undefined && pinned !== version) {
      throw new Error(`${key} ${pinned} in compose/.env differs from locked ${packageName} ${version} in ${djangoAsgiLock}. `
        + 'Run node scripts/versions/sync-framework-versions.mjs to regenerate the Python locks');
    }
    return [key, version];
  }));
}
