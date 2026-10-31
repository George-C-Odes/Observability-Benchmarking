import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = 'example/benchmark';
const resolver = fileURLToPath(new URL('./resolve-source.sh', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = (value) => value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const run = (overrides = {}) => ({
  id: 123,
  head_sha: 'abc123',
  head_branch: 'main',
  head_repository: { full_name: repository },
  conclusion: 'success',
  ...overrides,
});

function resolve(runs, overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'pages-resolver-'));
  try {
    const output = path.join(directory, 'output');
    const fixture = path.join(directory, 'runs.json');
    writeFileSync(output, '');
    writeFileSync(fixture, JSON.stringify({ workflow_runs: runs }));
    // Replace only curl; exercise the real Bash and Python resolver paths offline.
    writeFileSync(path.join(directory, 'curl'), '#!/usr/bin/env bash\ncp "$FIXTURE" "${@: -1}"\n', { mode: 0o755 });
    execFileSync(bash, ['-c', 'PATH="$MOCK_BIN:$PATH" bash "$RESOLVER"'], {
      env: {
        ...process.env,
        MOCK_BIN: shellPath(directory),
        FIXTURE: shellPath(fixture),
        RESOLVER: shellPath(resolver),
        GITHUB_OUTPUT: shellPath(output),
        GITHUB_REPOSITORY: repository,
        GITHUB_TOKEN: 'offline-test-token',
        EVENT_NAME: 'push',
        RESOLVE_WORKFLOW_NAME: 'Go Quality',
        RESOLVE_WORKFLOW_FILE: 'go_quality.yml',
        RESOLVE_ACCEPTED: 'success,failure',
        RESOLVE_BRANCH_MODE: 'main',
        ...overrides,
      },
      stdio: 'pipe',
    });
    return readFileSync(output, 'utf8').replaceAll('\r\n', '\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('live resolution skips forks even when their branch is named main', () => {
  assert.equal(resolve([run({ id: 999, head_repository: { full_name: 'fork/benchmark' } }), run()]), 'run_id=123\nhead_sha=abc123\n');
});

test('stage resolution skips forks and main but accepts failed repository branch runs', () => {
  assert.equal(resolve([
    run({ id: 999, head_branch: 'feature', head_repository: { full_name: 'fork/benchmark' } }),
    run(),
    run({ id: 456, head_branch: 'feature', conclusion: 'failure' }),
  ], { RESOLVE_BRANCH_MODE: 'non-main' }), 'run_id=456\nhead_sha=abc123\n');
});

test('success-only workflows skip failed reports', () => {
  assert.equal(resolve([run({ id: 999, conclusion: 'failure' }), run()], { RESOLVE_ACCEPTED: 'success' }), 'run_id=123\nhead_sha=abc123\n');
});

test('runs with missing source repository are excluded', () => {
  assert.equal(resolve([run({ head_repository: null })]), '');
});

const event = {
  EVENT_NAME: 'workflow_run',
  WR_NAME: 'Go Quality',
  WR_ID: '789',
  WR_HEAD_SHA: 'event-sha',
  WR_HEAD_BRANCH: 'feature',
  WR_HEAD_REPOSITORY: repository,
  WR_CONCLUSION: 'failure',
  RESOLVE_BRANCH_MODE: 'non-main',
};

test('matching repository event selects its triggering run', () => {
  assert.equal(resolve([], event), 'run_id=789\nhead_sha=event-sha\n');
});

test('fork event cannot bypass the API source filter', () => {
  assert.equal(resolve([run({ head_branch: 'feature' })], { ...event, WR_HEAD_REPOSITORY: 'fork/benchmark' }), 'run_id=123\nhead_sha=abc123\n');
});

test('main scope does not select a staging event', () => {
  assert.equal(resolve([run()], { ...event, RESOLVE_BRANCH_MODE: 'main' }), 'run_id=123\nhead_sha=abc123\n');
});
