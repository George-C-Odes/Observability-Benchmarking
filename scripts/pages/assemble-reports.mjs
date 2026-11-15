import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalog, validateRun } from './github-reports.mjs';
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

export function assembleReports(site, collections, repository) {
  for (const scope of ['live', 'stage']) {
    const destination = join(site, scope === 'live' ? 'quality' : 'stage/quality');
    mkdirSync(destination, { recursive: true });
    const rows = [];
    for (const producer of catalog) {
      const collection = join(collections, `collection-${scope}-${producer.id}`);
      let source = { status: 'collection unavailable' };
      if (existsSync(collection)) {
        safeTree(collection);
        const raw = JSON.parse(readFileSync(join(collection, 'source.json'), 'utf8'));
        if (raw.scope !== scope || raw.producer !== producer.id) throw new Error('Report provenance mismatch');
        if (raw.run_id && !validateRun({ id: raw.run_id, run_number: 1, head_sha: raw.head_sha, conclusion: raw.conclusion,
          head_branch: scope === 'live' ? 'main' : 'stage', head_repository: { full_name: repository } }, repository, scope)) throw new Error('Invalid report provenance');
        source = raw;
      }
      for (const report of producer.reports) {
        const directory = join(collection, report.artifact);
        let link = esc(report.title);
        let status = source.status;
        if (source.run_id && source.download === 'success' && existsSync(directory)) {
          const index = findIndex(directory);
          if (index) {
            const reportDestination = join(destination, report.path);
            cpSync(directory, reportDestination, { recursive: true });
            if (index !== 'index.html') {
              const target = `./${index.split('/').map(encodeURIComponent).join('/')}`;
              writeFileSync(join(reportDestination, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Quality report</title></head><body><a href="${target}">Open report</a></body></html>`);
            }
            link = `<a href="./${report.path}/">${esc(report.title)}</a>`;
            status = 'available';
          } else status = 'report missing';
        } else if (source.run_id) status = source.download === 'failure' ? 'download failed' : 'report missing';
        if (status !== 'available') {
          const reportDestination = join(destination, report.path);
          mkdirSync(reportDestination, { recursive: true });
          writeFileSync(join(reportDestination, 'index.html'), htmlPage({ title: report.title,
            body: `<h1>${esc(report.title)}</h1><p>Report ${esc(status)}.</p><p>Workflow conclusion: ${esc(source.conclusion || 'unknown')}. Run: ${esc(source.run_id || 'unknown')}. Analyzed commit: <code>${esc(source.head_sha || 'unknown')}</code>.</p><p><a href="../">All quality reports</a></p>` }));
        }
        rows.push(`<tr><td>${link}</td><td>${esc(status)}</td><td>${esc(source.conclusion || 'unknown')}</td><td>${esc(source.run_id || '—')}</td><td><code>${esc(source.head_sha || 'unknown')}</code></td></tr>`);
      }
    }
    const body = `<h1>${scope === 'live' ? 'Main' : 'Shared staging'} quality reports</h1>
<p>Latest eligible runs by creation order. Failed scans remain visible. Staging combines the latest runs from repository branches.</p>
<table><thead><tr><th>Report</th><th>Availability</th><th>Workflow conclusion</th><th>Run</th><th>Analyzed commit</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    writeFileSync(join(destination, 'index.html'), htmlPage({ title: 'Quality reports', body }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assembleReports('_site', '.collections', process.env.GITHUB_REPOSITORY);
