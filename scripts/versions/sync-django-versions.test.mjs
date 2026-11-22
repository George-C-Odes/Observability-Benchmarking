import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { djangoGeneratedFiles, djangoInputs, djangoLocks, lockedDjangoVersion, pinDjangoInput, pinGunicornInput, lockedGunicornVersion, ruffInputs, runCompiler, syncDjangoVersions } from './sync-django-versions.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';

const ciLock = '.github/requirements/python-ci.txt';
const ruffPin = 'ruff==0.17.5\n';

test('compiler wrapper does not replace the actual regeneration command in headers', (t) => {
  const workspace = temporaryDirectory(t, 'django-compiler-');
  assert.doesNotThrow(() => runCompiler(process.execPath, ['--input-type=module', '-e',
    'import assert from "node:assert/strict"; assert.equal(process.env.CUSTOM_COMPILE_COMMAND ?? "", process.argv[1]);',
    process.env.CUSTOM_COMPILE_COMMAND ?? ''], workspace));
});

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
  writeFileSync(envPath, `DJANGO_VERSION: ${version}\nGUNICORN_VERSION: 27.0.1\nRUFF_VERSION: 0.17.5\n`);
  const frameworkPins = 'django==6.1.2\ngunicorn==27.0.1\n';
  for (const file of djangoGeneratedFiles) {
    const full = path.join(workspace, file);
    mkdirSync(path.dirname(full), { recursive: true });
    let content = frameworkPins;
    if (djangoInputs.includes(file)) content = 'Django>=6.1.2,<7\ngunicorn==27.0.1\n';
    if (ruffInputs.includes(file)) content = ruffPin;
    if (file === ciLock) content += ruffPin;
    writeFileSync(full, content);
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
    if (args.includes('--version')) {
      assert.deepEqual(args, ['-m', 'piptools', 'compile', '--version']);
      assert.ok(djangoInputs.every((file) => readFileSync(path.join(workspace, file), 'utf8').startsWith('Django>=6.1.2')));
    } else if (args.includes('compile')) {
      const output = args.find((arg) => arg.startsWith('--output-file=')).slice('--output-file='.length);
      writeFileSync(path.join(workspace, output), 'django==7.0.1\ngunicorn==27.0.1\n');
    } else if (command === 'bash') {
      for (const file of djangoLocks.slice(2)) {
        const pins = 'django==7.0.1 \\\n    --hash=sha256:verified-by-compiler\ngunicorn==27.0.1\n';
        writeFileSync(path.join(workspace, file), pins + (file === ciLock ? ruffPin : ''));
      }
    }
  };
  const results = syncDjangoVersions({ ...options, run });
  assert.ok(results.some(({ changed }) => changed));
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], ['python', ['-m', 'piptools', 'compile', '--version']]);
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

test('regeneration rejects a stale version in any Django lock file', (t) => {
  for (const staleFile of djangoLocks) {
    const options = fixture(t);
    const run = (command, _args, workspace) => {
      if (command !== 'bash') return;
      for (const file of djangoLocks) {
        if (file !== staleFile) {
          const pins = 'django==7.0.1\ngunicorn==27.0.1\n';
          writeFileSync(path.join(workspace, file), pins + (file === ciLock ? ruffPin : ''));
        }
      }
    };
    assert.throws(() => syncDjangoVersions({ ...options, run }), {
      message: `Django lock regeneration did not propagate 7.0.1: ${staleFile}`,
    });
  }
});

test('input-only normalization does not change hashes or invoke Python', (t) => {
  const options = fixture(t, '6.1.2');
  const results = syncDjangoVersions({ ...options, run: () => assert.fail('no compiler needed') });
  assert.equal(results.filter(({ changed }) => changed).length, 2);
  for (const file of djangoInputs) assert.match(readFileSync(path.join(options.workspace, file), 'utf8'), /^Django==6\.1\.2/m);
});

test('Gunicorn pins preserve comments and CRLF and reject malformed requirements', () => {
  const input = '#gunicorn==1\r\nGunicorn>=26,<27 # server\r\nDjango==6.1.2\r\n';
  const expected = input.replace('Gunicorn>=26,<27', 'Gunicorn==27.0.1');
  assert.equal(pinGunicornInput(input, '27.0.1'), expected);
  assert.equal(pinGunicornInput(expected, '27.0.1'), expected);
  for (const invalid of ['#gunicorn==1', 'gunicorn==1\ngunicorn==2', 'gunicorn~=27']) {
    assert.throws(() => pinGunicornInput(invalid, '27.0.1'), /exactly one/);
    assert.throws(() => lockedGunicornVersion(invalid), /exactly one/);
  }
  assert.throws(() => pinGunicornInput(input, '27;echo bad'), /invalid version/);
  assert.equal(lockedGunicornVersion('gunicorn==27.0.1 \\\n    --hash=sha256:abc\n'), '27.0.1');
});

test('Gunicorn-only upgrade regenerates both runtimes and shared hashes, then runs offline', (t) => {
  const options = fixture(t, '6.1.2');
  for (const file of [...djangoInputs, ...djangoLocks]) {
    const full = path.join(options.workspace, file);
    writeFileSync(full, readFileSync(full, 'utf8').replace('gunicorn==27.0.1', 'gunicorn==26.0.0'));
  }
  const before = djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8'));
  assert.throws(() => syncDjangoVersions({ ...options, check: true, run: () => assert.fail('read only') }), /out of date/);
  assert.throws(() => syncDjangoVersions({ ...options, run: () => { throw new Error('compiler missing'); } }), /compiler missing/);
  assert.deepEqual(djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8')), before);
  const calls = [];
  const run = (command, args, workspace) => {
    calls.push([command, args]);
    if (args.includes('--version')) return;
    for (const file of djangoInputs) {
      assert.match(readFileSync(path.join(workspace, file), 'utf8'), /^gunicorn==27\.0\.1$/m);
    }
    if (command === 'python') {
      assert.equal(args[args.indexOf('--upgrade-package') + 1], 'gunicorn');
      assert.equal(args.filter((arg) => arg === '--upgrade-package').length, 1);
      const output = args.find((arg) => arg.startsWith('--output-file=')).slice('--output-file='.length);
      writeFileSync(path.join(workspace, output), 'django==6.1.2\ngunicorn==27.0.1\n');
    } else {
      for (const file of djangoLocks.slice(2)) {
        const pins = 'django==6.1.2\ngunicorn==27.0.1 \\\n    --hash=sha256:regenerated\n';
        writeFileSync(path.join(workspace, file), pins + (file === ciLock ? ruffPin : ''));
      }
    }
  };
  syncDjangoVersions({ ...options, run });
  assert.equal(calls.length, 4);
  const noCompiler = () => assert.fail('already synchronized');
  assert.ok(syncDjangoVersions({ ...options, check: true, run: noCompiler }).every(({ changed }) => !changed));
  assert.ok(syncDjangoVersions({ ...options, run: noCompiler }).every(({ changed }) => !changed));
});

test('regeneration rejects Gunicorn drift in every lock and missing env pins before writes', (t) => {
  for (const staleFile of djangoLocks) {
    const options = fixture(t, '6.1.2');
    const full = path.join(options.workspace, staleFile);
    writeFileSync(full, 'django==6.1.2\ngunicorn==26.0.0\n');
    assert.throws(() => syncDjangoVersions({ ...options, run: () => {} }), {
      message: `Gunicorn lock regeneration did not propagate 27.0.1: ${staleFile}`,
    });
  }
  const options = fixture(t);
  writeFileSync(options.envPath, 'DJANGO_VERSION: 6.1.2\n');
  const before = djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8'));
  assert.throws(() => syncDjangoVersions({ ...options, run: () => assert.fail('no compiler') }), /GUNICORN_VERSION/);
  assert.deepEqual(djangoGeneratedFiles.map((file) => readFileSync(path.join(options.workspace, file), 'utf8')), before);
});

test('a Ruff-only bump updates both dev pins and the hashed CI inventory without compiling runtime requirements', (t) => {
  const { workspace, envPath } = fixture(t, '6.1.2');
  const full = (file) => path.join(workspace, file);
  for (const file of djangoInputs) writeFileSync(full(file), 'django==6.1.2\ngunicorn==27.0.1\n');
  const read = (file) => readFileSync(full(file), 'utf8');
  const before = read(ciLock).replace('ruff==0.17.5', `ruff==0.17.5 \\\n    --hash=sha256:${'a'.repeat(64)}`);
  writeFileSync(full(ciLock), before);
  writeFileSync(envPath, read('.env').replace('0.17.5', '0.17.6'));
  const run = t.mock.fn((command, args) => {
    if (args.includes('--version')) return;
    assert.deepEqual([command, args], ['bash', ['.github/requirements/update-lock.sh']]);
    for (const file of ruffInputs) assert.equal(read(file), 'ruff==0.17.6\n');
    assert.equal(read(ciLock), before);
    writeFileSync(full(ciLock), before.replace('0.17.5', '0.17.6').replace('a'.repeat(64), 'b'.repeat(64)));
  });
  const options = { workspace, envPath, run };
  assert.throws(() => syncDjangoVersions({ ...options, check: true }), /Ruff versions are out of date/);
  assert.equal(run.mock.callCount(), 0);
  const updated = syncDjangoVersions(options).filter(({ changed }) => changed).map(({ filePath }) => filePath);
  assert.deepEqual(updated, [...ruffInputs, ciLock].map(full));
  assert.equal(run.mock.callCount(), 2);
  assert.ok(syncDjangoVersions({ ...options, check: true }).every(({ changed }) => !changed));
  assert.ok(syncDjangoVersions(options).every(({ changed }) => !changed));
  assert.equal(run.mock.callCount(), 2);
});
