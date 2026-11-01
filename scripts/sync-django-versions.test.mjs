import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { djangoGeneratedFiles, djangoInputs, djangoLocks, lockedDjangoVersion, pinDjangoInput, syncDjangoVersions } from './sync-django-versions.mjs';
import { temporaryDirectory } from './test-helpers.mjs';

test('Django input pins preserve unrelated dependencies, comments, casing and CRLF', () => {
  const input = '#Django>=1,<2\r\nDjango>=6.1.2,<7 # framework\r\ngunicorn>=26,<27\r\n';
  const expected = input.replace('Django>=6.1.2,<7 #', 'Django==7.0.1 #');
  assert.equal(pinDjangoInput(input, '7.0.1'), expected);
  assert.equal(pinDjangoInput(expected, '7.0.1'), expected);
  for (const invalid of ['#Django==1', 'django==1\ndjango==2', 'django~=6.1']) {
    assert.throws(() => pinDjangoInput(invalid, '7.0.1'), /exactly one/);
  }
  assert.throws(() => pinDjangoInput(input, '7;echo bad'), /invalid version/);
  assert.equal(lockedDjangoVersion('django==6.1.2 \\\n    --hash=sha256:abc\n'), '6.1.2');
  assert.throws(() => lockedDjangoVersion('# django==1\n'), /exactly one/);
});

function fixture(t, version = '7.0.1') {
  const workspace = temporaryDirectory(t, 'django-sync-');
  const envPath = path.join(workspace, '.env');
  writeFileSync(envPath, `DJANGO_VERSION: ${version}\n`);
  for (const file of djangoGeneratedFiles) {
    const full = path.join(workspace, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, djangoInputs.includes(file) ? 'Django>=6.1.2,<7\ngunicorn>=26,<27\n' : 'django==6.1.2\n');
  }
  return { workspace, envPath };
}

test('check mode never writes or launches a compiler; missing compiler leaves inputs untouched', (t) => {
  const options = fixture(t);
  const before = djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8'));
  assert.throws(() => syncDjangoVersions({ ...options, check: true, run: () => assert.fail('read-only') }), /out of date/);
  assert.throws(() => syncDjangoVersions({ ...options, run: () => { throw new Error('compiler missing'); } }), /compiler missing/);
  assert.deepEqual(djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8')), before);
});

test('regenerate runtime resolutions before central hashes and projections; repeat runs are offline', (t) => {
  const options = fixture(t);
  const calls = [];
  const run = (command, args, workspace) => {
    calls.push([command, args]);
    if (args.includes('compile')) {
      const output = args.find((arg) => arg.startsWith('--output-file=')).slice('--output-file='.length);
      writeFileSync(path.join(workspace, output), 'django==7.0.1\n');
    } else if (command === 'bash') {
      for (const file of djangoLocks.slice(2)) writeFileSync(path.join(workspace, file), 'django==7.0.1 \\\n    --hash=sha256:verified-by-compiler\n');
    }
  };
  const results = syncDjangoVersions({ ...options, run });
  assert.ok(results.some(({ changed }) => changed));
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], ['python', ['-m', 'piptools', '--version']]);
  for (const [, args] of calls.slice(1, 3)) {
    assert.ok(args.includes('--upgrade-package'));
    assert.ok(args.includes('--pip-args=--only-binary :all:'));
    assert.ok(!args.includes('--upgrade'));
  }
  assert.deepEqual(calls[3], ['bash', ['.github/requirements/update-lock.sh']]);
  const noCompiler = () => assert.fail('up-to-date sync must not resolve packages');
  assert.ok(syncDjangoVersions({ ...options, check: true, run: noCompiler }).every(({ changed }) => !changed));
  assert.ok(syncDjangoVersions({ ...options, run: noCompiler }).every(({ changed }) => !changed));
});

test('input-only normalization does not change hashes or invoke Python', (t) => {
  const options = fixture(t, '6.1.2');
  const results = syncDjangoVersions({ ...options, run: () => assert.fail('no compiler needed') });
  assert.equal(results.filter(({ changed }) => changed).length, 2);
  for (const file of djangoInputs) assert.match(readFileSync(path.join(options.workspace, file), 'utf8'), /^Django==6\.1\.2/m);
});
