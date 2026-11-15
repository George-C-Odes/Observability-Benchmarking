import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { assembleReports } from './assemble-reports.mjs';
import { catalog, collectionPlan, resolveReport } from './github-reports.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';

test('assembly preserves every catalog URL, nested HTML and failed-run provenance in both scopes', (t) => {
  const root = temporaryDirectory(t, 'pages-assembly-');
  const site = join(root, 'site');
  const collections = join(root, 'collections');
  for (const scope of ['live', 'stage']) {
    for (const producer of collectionPlan) {
      const directory = join(collections, `collection-${scope}-${producer.id}`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'source.json'), JSON.stringify({ producer: producer.producer, report: producer.report, scope, run_id: '123', head_sha: 'a'.repeat(40), conclusion: 'failure', status: 'resolved', download: 'success' }));
      for (const report of producer.reports) {
        mkdirSync(join(directory, report.artifact, 'nested'), { recursive: true });
        writeFileSync(join(directory, report.artifact, 'nested', 'index.html'), '<h1>Scan diagnostics</h1>');
      }
    }
  }
  assembleReports(site, collections, 'example/benchmark');
  for (const scopePath of ['quality', 'stage/quality']) {
    const html = readFileSync(join(site, scopePath, 'index.html'), 'utf8');
    assert.match(html, /failure/);
    assert.match(html, /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
    for (const producer of catalog) for (const report of producer.reports) {
      assert.ok(existsSync(join(site, scopePath, report.path, 'nested/index.html')));
      assert.ok(html.includes(`./${report.path}/`));
      assert.match(readFileSync(join(site, scopePath, report.path, 'index.html'), 'utf8'), /url=.\/nested\/index.html/);
    }
  }
});

test('missing collections and failed downloads cannot appear available', (t) => {
  const root = temporaryDirectory(t, 'pages-unavailable-');
  const directory = join(root, 'collections/collection-live-go');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'source.json'), JSON.stringify({ producer: 'go', scope: 'live', run_id: '123', head_sha: 'a'.repeat(40), conclusion: 'failure', download: 'failure' }));
  assembleReports(join(root, 'site'), join(root, 'collections'), 'example/benchmark');
  const html = readFileSync(join(root, 'site/quality/index.html'), 'utf8');
  assert.match(html, /download failed/);
  assert.match(html, /collection unavailable/);
  assert.ok(!html.includes('<td>available</td>'));
  assert.match(readFileSync(join(root, 'site/quality/go/index.html'), 'utf8'), /download failed/);
});

test('a report junction cannot publish outside files', (t) => {
  const root = temporaryDirectory(t, 'pages-symlink-');
  const directory = join(root, 'collections/collection-live-go');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, 'outside'));
  writeFileSync(join(root, 'outside/index.html'), 'private data');
  symlinkSync(join(root, 'outside'), join(directory, 'quality-report-go'), 'junction');
  assert.throws(() => assembleReports(join(root, 'site'), join(root, 'collections'), 'example/benchmark'), /symlinks/);
  assert.ok(!existsSync(join(root, 'site/quality/go/index.html')));
});

test('independent Qodana sources preserve an untouched report while exposing a newer failed scope', async (t) => {
  const root = temporaryDirectory(t, 'pages-qodana-scopes-');
  const site = join(root, 'site');
  const collections = join(root, 'collections');
  const repository = 'example/benchmark';
  const makeRun = (id, conclusion = 'success') => ({ id, run_number: id, head_sha: String(id).repeat(40),
    head_branch: 'feature', head_repository: { full_name: repository }, conclusion });
  const runs = [makeRun(3), makeRun(2, 'failure'), makeRun(1)];
  for (const producer of collectionPlan.filter((entry) => entry.producer === 'qodana')) {
    const source = await resolveReport({ repository, token: 'synthetic-token', producer: producer.producer,
      scope: 'stage', report: producer.report, fetchImpl: async (url) => {
        const match = /\/runs\/([0-9]+)\/jobs\?/.exec(url);
        if (!match) return { ok: true, json: async () => ({ workflow_runs: runs }) };
        const id = Number(match[1]);
        const skipped = id === 3 || (id === 2 && producer.report === 'qodana-report-services-java');
        const job = { name: producer.reports[0].job, conclusion: !skipped && id === 2 ? 'failure' : 'success', steps: [
          { name: 'Record unaffected scope', conclusion: skipped ? 'success' : 'skipped' },
          { name: 'Qodana Scan', conclusion: skipped ? 'skipped' : id === 2 ? 'failure' : 'success' },
        ] };
        return { ok: true, json: async () => ({ jobs: [job] }) };
      } });
    const directory = join(collections, `collection-stage-${producer.id}`);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'source.json'), JSON.stringify({ ...source, download: 'success' }));
    if (source.run_id === '1') {
      mkdirSync(join(directory, producer.report));
      writeFileSync(join(directory, producer.report, 'index.html'), 'Previous services scan');
    }
  }
  assembleReports(site, collections, repository);
  assert.equal(readFileSync(join(site, 'stage/quality/services-java/index.html'), 'utf8'), 'Previous services scan');
  const orchestrator = readFileSync(join(site, 'stage/quality/orchestrator/index.html'), 'utf8');
  assert.match(orchestrator, /report missing/);
  assert.match(orchestrator, /failure/);
  assert.match(orchestrator, /Run: 2/);
  assert.match(orchestrator, /2222222222222222222222222222222222222222/);
  const index = readFileSync(join(site, 'stage/quality/index.html'), 'utf8');
  assert.match(index, /Java services<\/a><\/td><td>available<\/td><td>success<\/td><td>1/);
  assert.match(index, /Orchestrator<\/td><td>report missing<\/td><td>failure<\/td><td>2/);
});

test('Qodana failed downloads and unavailable scope evidence cannot reuse older green content', (t) => {
  for (const state of [{ status: 'resolved', download: 'failure', expected: 'download failed' },
    { status: 'scope evidence unavailable', download: 'skipped', expected: 'scope evidence unavailable' }]) {
    const root = temporaryDirectory(t, 'pages-qodana-unavailable-');
    const directory = join(root, 'collections/collection-stage-qodana-orchestrator');
    mkdirSync(join(directory, 'qodana-report-orchestrator'), { recursive: true });
    writeFileSync(join(directory, 'qodana-report-orchestrator/index.html'), 'Never publish this stale artifact');
    writeFileSync(join(directory, 'source.json'), JSON.stringify({ producer: 'qodana', report: 'qodana-report-orchestrator',
      scope: 'stage', run_id: '456', head_sha: 'b'.repeat(40), conclusion: 'failure', ...state }));
    assembleReports(join(root, 'site'), join(root, 'collections'), 'example/benchmark');
    const html = readFileSync(join(root, 'site/stage/quality/orchestrator/index.html'), 'utf8');
    assert.ok(html.includes(state.expected));
    assert.ok(!html.includes('Never publish'));
    assert.match(html, /Run: 456/);
  }
});

test('a Qodana collection cannot substitute the other report provenance', (t) => {
  const root = temporaryDirectory(t, 'pages-qodana-provenance-');
  const directory = join(root, 'collections/collection-live-qodana-services-java');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'source.json'), JSON.stringify({ producer: 'qodana', scope: 'live', report: 'qodana-report-orchestrator' }));
  assert.throws(() => assembleReports(join(root, 'site'), join(root, 'collections'), 'example/benchmark'), /provenance mismatch/);
});
