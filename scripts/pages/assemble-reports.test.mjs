import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { assembleReports } from './assemble-reports.mjs';
import { catalog } from './github-reports.mjs';
import { temporaryDirectory } from '../test-helpers.mjs';

test('assembly preserves every catalog URL, nested HTML and failed-run provenance in both scopes', (t) => {
  const root = temporaryDirectory(t, 'pages-assembly-');
  const site = join(root, 'site');
  const collections = join(root, 'collections');
  for (const scope of ['live', 'stage']) {
    for (const producer of catalog) {
      const directory = join(collections, `collection-${scope}-${producer.id}`);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'source.json'), JSON.stringify({ producer: producer.id, scope, run_id: '123', head_sha: 'a'.repeat(40), conclusion: 'failure', status: 'resolved', download: 'success' }));
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
