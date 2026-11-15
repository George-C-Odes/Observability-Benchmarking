import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checks = {
  format: { file: 'oxfmt-output.txt', commands: [['oxfmt', 'oxfmt', '--check', '.']] },
  lint: { file: 'oxlint-report.json', commands: [['oxlint', 'oxlint', '--deny-warnings', '--format', 'json', '.']] },
  typecheck: { file: 'typescript-output.txt', commands: [['next', 'next', 'typegen'], ['typescript', 'tsc', '--noEmit']] },
};

// The output root comes from this trusted module, never argv, cwd or the environment.
const dashboard = fileURLToPath(new URL('../utils/nextjs-dash/', import.meta.url));

function checkedPath(root, candidate, { missing = false } = {}) {
  const suffix = relative(root, candidate);
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith(`..${sep}`)) throw new Error('Path escapes quality workspace');
  let current = root;
  for (const component of ['', ...suffix.split(sep).filter(Boolean)]) {
    current = join(current, component);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) throw new Error('Quality workspace symlinks are not allowed');
      if (info.isFile() && info.nlink !== 1) throw new Error('Quality workspace hard links are not allowed');
      if (!info.isFile() && !info.isDirectory()) throw new Error('Quality workspace special files are not allowed');
    } catch (error) {
      if (!missing || error.code !== 'ENOENT') throw error;
    }
  }
  return candidate;
}

function checkerBin(packageName, command) {
  // Check intermediate directories before reading the package manifest.
  const packageRoot = checkedPath(dashboard, join(dashboard, 'node_modules', packageName));
  const manifestPath = checkedPath(packageRoot, join(packageRoot, 'package.json'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[command];
  if (typeof bin !== 'string' || isAbsolute(bin)) throw new Error('Invalid checker executable');
  return checkedPath(packageRoot, resolve(packageRoot, bin));
}

function runChecker(commandSpec, { run, timeout, stdout }) {
  const [packageName, command, ...args] = commandSpec;
  const result = run(process.execPath, [checkerBin(packageName, command), ...args], {
    cwd: dashboard, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 20 * 1024 * 1024, shell: false,
  });
  stdout.write((result.stdout || '') + (result.stderr || ''));
  const failed = result.error || result.signal || !Number.isInteger(result.status);
  return { status: failed ? 2 : result.status, output: result.stdout || '', stderr: result.stderr || '' };
}

// Fixed operations, native Node executable, argument vectors, and a bounded lifetime.
export function captureCheck(mode, { run = spawnSync, timeout = 300_000, stdout = process.stdout } = {}) {
  if (!Object.hasOwn(checks, mode)) throw new Error('Unknown quality check');
  // Reject redirected output files before executing any checker or writing evidence.
  checkedPath(fileURLToPath(new URL('../', import.meta.url)), dashboard);
  const check = checks[mode];
  const outputPath = checkedPath(dashboard, join(dashboard, check.file), { missing: true });
  const statusPath = checkedPath(dashboard, join(dashboard, `${mode}-status.json`), { missing: true });
  let output = '';
  let status = 0;
  for (const command of check.commands) {
    try {
      const result = runChecker(command, { run, timeout, stdout });
      output += result.output;
      status = result.status;
      if (mode !== 'lint') output += result.stderr;
    } catch {
      status = 2;
      if (mode !== 'lint') output += 'Quality checker could not start.\n';
    }
    if (status !== 0) break;
    if (mode === 'typecheck') output = '';
  }
  if (mode === 'format') output += `\nOXFMT_EXIT_CODE=${status}\n`;
  writeFileSync(outputPath, output);
  // Reviewed S8707: argv[2] must be an own key of checks before any I/O.
  // Only format/lint/typecheck status names reach the module-derived dashboard;
  // checkedPath rejects escapes and link redirection. The CLI cannot select a root.
  // User-authorized 2026-11-15; this directive is line-wide, not rule-specific.
  // Re-review if inputs, roots, checks or workspace isolation change. Evidence:
  // scripts/quality/sonar-exceptions.md and capture-check.test.mjs.
  writeFileSync(statusPath, JSON.stringify({ exitCode: status })); // NOSONAR - reviewed S8707 false positive; fixed-root allowlisted operation.
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = captureCheck(process.argv[2]);
