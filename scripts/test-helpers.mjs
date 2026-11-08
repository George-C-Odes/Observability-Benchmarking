import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function assertReleaseMetadataRequest(options) {
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.deepEqual(options.headers, { Accept: 'application/vnd.github+json' });
  assert.ok(options.signal instanceof AbortSignal);
}

export function temporaryDirectory(t, prefix) {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => {
    // Verify the cleanup target is the temporary directory created by this test.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith(prefix));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
