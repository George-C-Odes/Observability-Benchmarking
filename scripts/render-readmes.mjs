import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export function resolveRepoPath(targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(repoRoot, targetPath);
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
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

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

function padCell(text, width, align) {
  if (align === 'right') return ' ' + text.padStart(width) + ' ';
  if (align === 'center') {
    const total = width - text.length;
    const left = Math.floor(total / 2);
    const right = total - left;
    return ' ' + ' '.repeat(left) + text + ' '.repeat(right) + ' ';
  }
  return ' ' + text.padEnd(width) + ' ';
}

function alignTable(lines) {
  const rows = lines.map(splitTableRow);
  const colCount = Math.max(...rows.map((r) => r.length));

  // Derive alignment per column from the separator row (index 1).
  const separatorRow = rows.length > 1 ? rows[1] : [];
  const aligns = [];
  for (let c = 0; c < colCount; c++) {
    aligns.push(c < separatorRow.length ? columnAlignment(separatorRow[c]) : 'left');
  }

  // Determine max content width per column (skip separator row at index 1).
  const widths = new Array(colCount).fill(0);
  for (let r = 0; r < rows.length; r++) {
    if (r === 1) continue;
    for (let c = 0; c < rows[r].length; c++) {
      widths[c] = Math.max(widths[c], rows[r][c].length);
    }
  }

  // Minimum content width of 1 (separator will be at least 3 chars: w + 2 = 3).
  for (let c = 0; c < colCount; c++) {
    widths[c] = Math.max(widths[c], 1);
  }

  return rows.map((cells, r) => {
    const formatted = [];

    for (let c = 0; c < colCount; c++) {
      const cell = c < cells.length ? cells[c] : '';
      const w = widths[c];

      if (r === 1) {
        // Separator: dashes span the full column slot (content width + 2 for
        // the spaces that surround data cells), matching `|------|` convention.
        const hasLeft = cell.startsWith(':');
        const hasRight = cell.endsWith(':') && cell.length > 1;
        const dashCount = w + 2 - (hasLeft ? 1 : 0) - (hasRight ? 1 : 0);
        formatted.push((hasLeft ? ':' : '') + '-'.repeat(dashCount) + (hasRight ? ':' : ''));
      } else {
        formatted.push(padCell(cell, w, aligns[c]));
      }
    }

    return '|' + formatted.join('|') + '|';
  });
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
    throw new Error(`Manifest must contain a 'defaultTemplatePaths' array: ${absoluteManifestPath}`);
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