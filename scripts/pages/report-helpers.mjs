// scripts/pages/report-helpers.mjs
//
// Shared utilities for the quality-report HTML generators
// (CodeQL, Go, Next.js).  Extracted to eliminate ~200 lines of
// duplicated HTML helpers, CSS theming, and metadata assembly
// across the three generators.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Return ✅ or ❌ for pass/fail status. */
export function statusIcon(pass) {
  return pass ? '\u2705' : '\u274C';
}

/**
 * Shorten an absolute file path to a project-relative path.
 * @param {string} cwd - The working directory to resolve against.
 * @param {string} p   - The file path to shorten.
 */
export function shortPath(cwd, p) {
  try {
    const r = relative(cwd, p);
    return r.startsWith('..') ? p : r;
  } catch {
    return p;
  }
}

/**
 * Read a file if it exists, returning null otherwise.
 * @param {string} cwd  - The working directory.
 * @param {string} name - The file name relative to cwd.
 */
export function readOptionalFile(cwd, name) {
  const p = resolve(cwd, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Build the standard metadata parts array used in the report footer.
 * @param {{repo: string, commitSha: string, runId: string, timestamp: string, extras?: string[]}} opts
 * @returns {string[]} Array of HTML strings, one per metadata item.
 */
export function buildMetaParts({ repo, commitSha, runId, timestamp, extras = [] }) {
  const parts = [];
  if (repo && commitSha !== 'local') {
    parts.push(
      `Commit <code><a href="https://github.com/${esc(repo)}/commit/${esc(commitSha)}">${esc(commitSha.slice(0, 10))}</a></code>`,
    );
  }
  if (runId && repo) {
    parts.push(
      `Workflow run <code><a href="https://github.com/${esc(repo)}/actions/runs/${esc(runId)}">${esc(runId)}</a></code>`,
    );
  }
  parts.push(`Generated ${esc(timestamp)}`);
  for (const extra of extras) {
    parts.push(extra);
  }
  return parts;
}

/**
 * Render metadata parts into the footer HTML.
 * @param {string[]} metaParts
 */
export function renderMeta(metaParts) {
  return `<div class="meta">
    ${metaParts.map((p) => `<span>${p}</span>`).join('\n    ')}
  </div>`;
}

// ---------------------------------------------------------------------------
// CSS theme
// ---------------------------------------------------------------------------

/**
 * Return the shared base CSS for quality reports (light + dark theme).
 * Callers can append report-specific rules after this string.
 * @param {string} [extraCSS=''] - Additional CSS rules to append.
 */
export function themeCSS(extraCSS = '') {
  return `    :root {
      --bg: #ffffff; --fg: #1a1a2e; --muted: #6e7781;
      --card-bg: #f6f8fa; --card-border: #d0d7de;
      --accent: #0969da; --error: #cf222e; --warn: #bf8700; --pass: #1a7f37;
      --note: #0550ae;
      --table-stripe: #f6f8fa; --table-border: #d8dee4;
      --badge-error-bg: #cf222e; --badge-warn-bg: #bf8700; --badge-note-bg: #0550ae;
      --pre-bg: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e;
        --card-bg: #161b22; --card-border: #30363d;
        --accent: #58a6ff; --error: #f85149; --warn: #d29922; --pass: #3fb950;
        --note: #58a6ff;
        --table-stripe: #161b22; --table-border: #30363d;
        --badge-error-bg: #da3633; --badge-warn-bg: #9e6a03; --badge-note-bg: #1f6feb;
        --pre-bg: #161b22;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      margin: 0; padding: 2rem 1rem;
      background: var(--bg); color: var(--fg);
      max-width: 72rem; margin-left: auto; margin-right: auto;
      line-height: 1.5;
    }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
    h2 { margin: 2rem 0 0.75rem; font-size: 1.25rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.35rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: var(--card-bg); padding: 0.15rem 0.35rem; border-radius: 0.25rem; font-size: 0.9em; }

    .subtitle { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.95rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 0.5rem; padding: 1rem 1.25rem;
    }
    .card-title { font-weight: 600; margin-bottom: 0.25rem; font-size: 0.95rem; }
    .card-value { font-size: 1.6rem; font-weight: 700; }
    .card-detail { color: var(--muted); font-size: 0.85rem; margin-top: 0.25rem; }
    .status-pass { color: var(--pass); }
    .status-fail { color: var(--error); }

    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; margin: 0.5rem 0 1rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--table-border); }
    th { font-weight: 600; background: var(--card-bg); position: sticky; top: 0; }
    tbody tr:nth-child(even) { background: var(--table-stripe); }
    .cell-file { max-width: 22rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.82rem; }
    .cell-loc { font-family: monospace; white-space: nowrap; }
    .cell-rule { font-family: monospace; font-size: 0.82rem; white-space: nowrap; }

    .badge {
      display: inline-block; padding: 0.1rem 0.5rem; border-radius: 1rem;
      font-size: 0.75rem; font-weight: 600; color: #fff; text-transform: uppercase;
    }
    .badge-error { background: var(--badge-error-bg); }
    .badge-warn { background: var(--badge-warn-bg); }
    .badge-note { background: var(--badge-note-bg); }

    .muted { color: var(--muted); }
    .meta { color: var(--muted); font-size: 0.82rem; margin-top: 2rem; border-top: 1px solid var(--card-border); padding-top: 1rem; }
    .meta span + span::before { content: ' \\00b7  '; }
    .back-link { margin-bottom: 1.5rem; font-size: 0.9rem; }
    .empty-state { color: var(--muted); font-style: italic; padding: 1.5rem 0; }
${extraCSS ? '\n' + extraCSS : ''}`;
}

// ---------------------------------------------------------------------------
// HTML shell
// ---------------------------------------------------------------------------

/** Shared favicon data URI used across all quality reports. */
const FAVICON = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Cpath d=%27M32 2L6 14v18c0 16.6 11.1 32.1 26 36 14.9-3.9 26-19.4 26-36V14Z%27 fill=%27%234695EB%27/%3E%3Cpath d=%27M28 40l-9-9 3.5-3.5L28 33l13.5-13.5L45 23Z%27 fill=%27%23fff%27/%3E%3C/svg%3E";

/**
 * Wrap report body content in the full HTML page shell.
 * @param {{title: string, extraCSS?: string, body: string}} opts
 */
export function htmlPage({ title, extraCSS = '', body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/svg+xml" href="${FAVICON}">
  <title>${title}</title>
  <style>
${themeCSS(extraCSS)}
  </style>
</head>
<body>
  <p class="back-link"><a href="../">\u2190 Back to quality reports index</a></p>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// File output
// ---------------------------------------------------------------------------

/**
 * Write the generated HTML report to disk.
 * @param {string} outDir - Directory to write into (created if missing).
 * @param {string} html   - The HTML content.
 * @returns {string} The absolute path to the written file.
 */
export function writeReport(outDir, html) {
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, 'index.html');
  writeFileSync(outFile, html, 'utf-8');
  return outFile;
}

