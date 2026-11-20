import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectionPlan, validateRun } from './github-reports.mjs';
import { esc, htmlPage } from './report-helpers.mjs';

function safeTree(directory) {
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Report symlinks are not allowed');
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Report symlinks are not allowed');
    if (entry.isDirectory()) safeTree(join(directory, entry.name));
    else if (!entry.isFile()) throw new Error('Report special files are not allowed');
  }
}

function findIndex(directory) {
  if (existsSync(join(directory, 'index.html'))) return 'index.html';
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nested = findIndex(join(directory, entry.name));
      if (nested) return `${entry.name}/${nested}`;
    }
  }
  return null;
}

function readSource(collection, producer, scope, repository) {
  if (!existsSync(collection)) return { status: 'collection unavailable' };
  safeTree(collection);
  const source = JSON.parse(readFileSync(join(collection, 'source.json'), 'utf8'));
  if (source.scope !== scope || source.producer !== producer.producer || source.report !== producer.report) throw new Error('Report provenance mismatch');
  const run = { id: source.run_id, run_number: 1, head_sha: source.head_sha, conclusion: source.conclusion,
    head_branch: scope === 'live' ? 'main' : 'stage', head_repository: { full_name: repository } };
  if (source.run_id && !validateRun(run, repository, scope)) throw new Error('Invalid report provenance');
  return source;
}

function copyReport(directory, destination) {
  const index = findIndex(directory);
  if (!index) return 'report missing';
  cpSync(directory, destination, { recursive: true });
  if (index !== 'index.html') {
    const target = `./${index.split('/').map(encodeURIComponent).join('/')}`;
    writeFileSync(join(destination, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Quality report</title></head><body><a href="${target}">Open report</a></body></html>`);
  }
  return 'available';
}

function reportStatus(source, download, directory, destination) {
  if (source.status && source.status !== 'resolved') return source.status;
  if (!source.run_id) return source.status;
  if (download === 'failure') return 'download failed';
  if (download !== 'success' || !existsSync(directory)) return 'report missing';
  return copyReport(directory, destination);
}

function timestampTag(value) {
  if (typeof value !== 'string') return '\u2014';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '\u2014';
  const iso = date.toISOString();
  if (iso.length !== 24 || iso.startsWith('0000-')) return '\u2014';
  const seconds = iso.slice(0, 19);
  if (value !== iso && value !== `${seconds}Z`) return '\u2014';
  return `<time datetime="${seconds}Z">${seconds.replace('T', ' ')} UTC</time>`;
}

function reportRow(report, collection, destination, source) {
  const reportDestination = join(destination, report.path);
  const status = reportStatus(source, source.downloads?.[report.artifact], join(collection, report.artifact), reportDestination);
  let link = esc(report.title);
  if (status === 'available') link = `<a href="./${report.path}/">${esc(report.title)}</a>`;
  else {
    mkdirSync(reportDestination, { recursive: true });
    writeFileSync(join(reportDestination, 'index.html'), htmlPage({ title: report.title,
      body: `<h1>${esc(report.title)}</h1><p>Availability: ${esc(status)}.</p><p>Workflow conclusion: ${esc(source.conclusion || 'unknown')}. Run: ${esc(source.run_id || 'unknown')}. Analyzed commit: <code>${esc(source.head_sha || 'unknown')}</code>.</p>` }));
  }
  const created = timestampTag(source.artifact_created_at?.[report.artifact]);
  return `<tr><td>${link}</td><td>${esc(status)}</td><td>${esc(source.conclusion || 'unknown')}</td><td>${esc(source.run_id || '\u2014')}</td><td><code>${esc(source.head_sha || 'unknown')}</code></td><td>${created}</td></tr>`;
}

export function assembleReports(site, collections, repository) {
  for (const scope of ['live', 'stage']) {
    const destination = join(site, scope === 'live' ? 'quality' : 'stage/quality');
    mkdirSync(destination, { recursive: true });
    const rows = [];
    for (const producer of collectionPlan) {
      const collection = join(collections, `collection-${scope}-${producer.id}`);
      const source = readSource(collection, producer, scope, repository);
      for (const report of producer.reports) rows.push(reportRow(report, collection, destination, source));
    }
    const generated = timestampTag(new Date().toISOString());
    const body = `<h1>${scope === 'live' ? 'Main' : 'Shared staging'} quality reports</h1>
<p class="subtitle">Index generated ${generated}</p>
<p>Latest eligible scan for each report by creation order. Unaffected Qodana scopes retain their previous scan. Failed scans remain visible. Staging combines the latest runs from repository branches.</p>
<div class="table-scroll" tabindex="0" role="region" aria-label="Quality report details">
  <table><thead><tr><th>Report</th><th>Availability</th><th>Workflow conclusion</th><th>Run</th><th>Analyzed commit</th><th>Report artifact created</th></tr></thead><tbody>${rows.join('')}</tbody></table>
</div>`;
    const navigation = scope === 'live'
      ? { href: '../stage/quality/', label: 'Shared staging quality reports' }
      : { href: '../../quality/', label: 'Main quality reports' };
    writeFileSync(join(destination, 'index.html'), htmlPage({ title: 'Quality reports', body, navigation,
      extraCSS: '    .table-scroll { overflow-x: auto; }' }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assembleReports('_site', '.collections', process.env.GITHUB_REPOSITORY);
