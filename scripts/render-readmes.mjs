import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export function resolveRepoPath(targetPath) {
  if (typeof targetPath !== 'string') {
    throw new TypeError('Path must be a string');
  }
  return path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(repoRoot, targetPath);
}

export function parseColonEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

export function renderTemplate(templateContent, variables) {
  return templateContent.replace(/\{\{\s*([A-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing value for placeholder {{${key}}}`);
    }

    return variables[key];
  });
}

// ── Markdown table re-alignment ──────────────────────────────────────────────
//
// After variable substitution, table columns can become ragged because
// placeholders like `{{SPRING_BOOT_VERSION}}` (24 chars) are replaced with
// short values like `4.0.4` (5 chars).  The functions below detect markdown
// tables in the rendered output and re-pad every cell so columns align again.

function looksLikeTableRow(line) {
  return typeof line === 'string' && /^\s*\|/.test(line);
}

function looksLikeSeparatorRow(line) {
  if (!looksLikeTableRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => typeof c === 'string' && /^:?-+:?$/.test(c));
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitTableRow(line) {
  let inner = line.trim();
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  return inner.split('|').map((cell) => cell.trim());
}

function columnAlignment(separatorCell) {
  const hasLeft = separatorCell.startsWith(':');
  const hasRight = separatorCell.endsWith(':') && separatorCell.length > 1;
  if (hasLeft && hasRight) return 'center';
  if (hasRight) return 'right';
  return 'left';
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isFullWidthCodePoint(codePoint) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1b000 && codePoint <= 0x1b001)
    || (codePoint >= 0x1f200 && codePoint <= 0x1f251)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function displayWidth(text) {
  let width = 0;

  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) {
      width += 2;
      continue;
    }

    const baseCharacter = [...segment].find(
      (character) => !/[\p{Mark}\p{Default_Ignorable_Code_Point}]/u.test(character),
    );

    if (!baseCharacter) continue;

    const codePoint = baseCharacter.codePointAt(0);
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) continue;
    width += isFullWidthCodePoint(codePoint) ? 2 : 1;
  }

  return width;
}

function padCell(text, width, align) {
  const padding = Math.max(0, width - displayWidth(text));

  if (align === 'right') return ' ' + ' '.repeat(padding) + text + ' ';
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return ' ' + ' '.repeat(left) + text + ' '.repeat(right) + ' ';
  }
  return ' ' + text + ' '.repeat(padding) + ' ';
}

function getColumnAlignments(separatorRow, colCount) {
  const aligns = [];
  for (let c = 0; c < colCount; c++) {
    aligns.push(c < separatorRow.length ? columnAlignment(separatorRow[c]) : 'left');
  }
  return aligns;
}

function getColumnWidths(rows, colCount) {
  const widths = new Array(colCount).fill(1);
  for (let r = 0; r < rows.length; r++) {
    if (r === 1) continue;
    for (let c = 0; c < rows[r].length; c++) {
      widths[c] = Math.max(widths[c], displayWidth(rows[r][c]));
    }
  }
  return widths;
}

function formatSeparatorCell(cell, width) {
  const hasLeft = cell.startsWith(':');
  const hasRight = cell.endsWith(':') && cell.length > 1;
  const dashCount = width + 2 - (hasLeft ? 1 : 0) - (hasRight ? 1 : 0);
  return (hasLeft ? ':' : '') + '-'.repeat(dashCount) + (hasRight ? ':' : '');
}

function formatRow(cells, rowIndex, colCount, widths, aligns) {
  const formatted = [];
  for (let c = 0; c < colCount; c++) {
    const cell = c < cells.length ? cells[c] : '';
    const width = widths[c];
    if (rowIndex === 1) {
      formatted.push(formatSeparatorCell(cell, width));
    } else {
      formatted.push(padCell(cell, width, aligns[c]));
    }
  }
  return '|' + formatted.join('|') + '|';
}

function alignTable(lines) {
  const rows = lines.map(splitTableRow);
  const colCount = Math.max(...rows.map((r) => r.length));
  const separatorRow = rows.length > 1 ? rows[1] : [];
  const aligns = getColumnAlignments(separatorRow, colCount);
  const widths = getColumnWidths(rows, colCount);

  return rows.map((cells, r) => formatRow(cells, r, colCount, widths, aligns));
}

export function realignMarkdownTables(content) {
  const lines = content.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    if (
      looksLikeTableRow(lines[i])
      && i + 1 < lines.length
      && looksLikeSeparatorRow(lines[i + 1])
    ) {
      const tableStart = i;
      while (i < lines.length && looksLikeTableRow(lines[i])) {
        i++;
      }
      result.push(...alignTable(lines.slice(tableStart, i)));
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

export function deriveOutputPath(templatePath) {
  const parsedPath = path.parse(templatePath);

  if (!parsedPath.name.endsWith('.template')) {
    throw new Error(`Template path must end with '.template${parsedPath.ext}': ${templatePath}`);
  }

  const outputName = parsedPath.name.slice(0, -'.template'.length);
  return path.join(parsedPath.dir, `${outputName}${parsedPath.ext}`);
}

export function loadManifestTemplatePaths(manifestPath) {
  const absoluteManifestPath = resolveRepoPath(manifestPath);
  const manifestContent = readFileSync(absoluteManifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  const defaultTemplatePaths = manifest?.defaultTemplatePaths;

  if (!Array.isArray(defaultTemplatePaths)) {
    throw new TypeError(`Manifest must contain a 'defaultTemplatePaths' array: ${absoluteManifestPath}`);
  }

  const invalidEntry = defaultTemplatePaths.find((entry) => typeof entry !== 'string' || entry.trim() === '');
  if (invalidEntry !== undefined) {
    throw new Error(`Manifest contains an invalid template path entry: ${absoluteManifestPath}`);
  }

  if (defaultTemplatePaths.length === 0) {
    throw new Error(`Manifest does not define any default template paths: ${absoluteManifestPath}`);
  }

  return defaultTemplatePaths;
}

export function resolveTemplatePaths({ templatePaths, manifestPath }) {
  if (Array.isArray(templatePaths) && templatePaths.length > 0) {
    return templatePaths;
  }

  return loadManifestTemplatePaths(manifestPath);
}

export function renderTemplates({ envPath, templatePaths, check = false }) {
  if (!Array.isArray(templatePaths) || templatePaths.length === 0) {
    throw new Error('Provide at least one README template path.');
  }

  const absoluteEnvPath = resolveRepoPath(envPath);
  const envContent = readFileSync(absoluteEnvPath, 'utf8');
  const variables = parseColonEnv(envContent);
  const results = [];

  for (const templatePath of templatePaths) {
    const absoluteTemplatePath = resolveRepoPath(templatePath);
    const absoluteOutputPath = deriveOutputPath(absoluteTemplatePath);
    const templateContent = readFileSync(absoluteTemplatePath, 'utf8');
    const renderedContent = realignMarkdownTables(renderTemplate(templateContent, variables));

    if (check) {
      const existingContent = readFileSync(absoluteOutputPath, 'utf8');
      if (existingContent !== renderedContent) {
        throw new Error(`Generated file is out of date: ${path.relative(repoRoot, absoluteOutputPath)}`);
      }
    } else {
      mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
      writeFileSync(absoluteOutputPath, renderedContent, 'utf8');
    }

    results.push({
      templatePath: absoluteTemplatePath,
      outputPath: absoluteOutputPath,
    });
  }

  return results;
}

function parseCliArgs(argv) {
  const templatePaths = [];
  let envPath = resolveRepoPath(path.join('compose', '.env'));
  let manifestPath = resolveRepoPath(path.join('scripts', 'render-readmes.manifest.json'));
  let check = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--env') {
      const nextArg = argv[index + 1];
      if (!nextArg) {
        throw new Error('Expected a path after --env');
      }
      envPath = resolveRepoPath(nextArg);
      index += 1;
      continue;
    }

    if (arg === '--manifest') {
      const nextArg = argv[index + 1];
      if (!nextArg) {
        throw new Error('Expected a path after --manifest');
      }
      manifestPath = resolveRepoPath(nextArg);
      index += 1;
      continue;
    }

    if (arg === '--check') {
      check = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true, envPath, manifestPath, check, templatePaths };
    }

    templatePaths.push(arg);
  }

  return { help: false, envPath, manifestPath, check, templatePaths };
}

function printUsage() {
  console.log(`Usage: node scripts/render-readmes.mjs [--env path/to/.env] [--manifest path/to/manifest.json] [--check] [template-path] [more-template-paths...]\n\nExamples:\n  node scripts/render-readmes.mjs\n  node scripts/render-readmes.mjs --check\n  node scripts/render-readmes.mjs services/README.template.md\n  node scripts/render-readmes.mjs docs/README.template.md services/java/quarkus/jvm/README.template.md\n  node scripts/render-readmes.mjs --manifest scripts/render-readmes.manifest.json --check`);
}

function main() {
  const { help, envPath, manifestPath, check, templatePaths } = parseCliArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const resolvedTemplatePaths = resolveTemplatePaths({ templatePaths, manifestPath });
  const results = renderTemplates({ envPath, templatePaths: resolvedTemplatePaths, check });
  const mode = check ? 'Checked' : 'Rendered';

  for (const result of results) {
    console.log(`${mode} ${path.relative(repoRoot, result.outputPath)} from ${path.relative(repoRoot, result.templatePath)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
