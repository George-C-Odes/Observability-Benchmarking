import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Only these literal artifact names may be written. No CLI input is a file path.
const artifacts = Object.freeze({
  code: Object.freeze({ log: 'code.log', status: 'code-status.json', sarif: 'code.sarif' }),
  test: Object.freeze({ log: 'test.log', status: 'test-status.json', json: 'test.json', sarif: 'test.sarif' }),
  monitor: Object.freeze({ log: 'monitor.log', status: 'monitor-status.json' }),
});

function validateMode(mode) {
  if (!Object.hasOwn(artifacts, mode)) throw new Error(`Unknown Snyk scan mode: ${mode}`);
}

// workingDirectory is the host-selected cwd (or a private test fixture), not CLI input.
export function scanFiles(mode, workingDirectory = process.cwd()) {
  validateMode(mode);
  if (typeof workingDirectory !== 'string' || !path.isAbsolute(workingDirectory)) {
    throw new Error('Snyk working directory must be an absolute host-selected path');
  }
  const root = pathToFileURL(workingDirectory.endsWith(path.sep) ? workingDirectory : `${workingDirectory}${path.sep}`);
  const directory = new URL('snyk-results/', root);
  return { directory, ...Object.fromEntries(Object.entries(artifacts[mode])
    .map(([key, filename]) => [key, new URL(filename, directory)])) };
}

function checkArtifactTarget(file, directory = false) {
  let stat;
  try {
    // On POSIX, a trailing separator makes lstat follow directory symlinks.
    stat = lstatSync(path.resolve(fileURLToPath(file)));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  // Do not overwrite linked files or follow an artifact directory outside the cwd.
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1)) {
    throw new Error(`Unsafe Snyk artifact target: ${file.href}`);
  }
}

// Exclude generated dependencies, build output, and installed agent packages,
// not source manifests (including .github's CI dependency inventories).
const discoveryArgs = [
  '--all-projects',
  '--detection-depth=8',
  '--exclude=node_modules,vendor,_site,target,.next,.venv,venv,apm_modules',
  '--command=python',
];

export function scanArguments(mode) {
  validateMode(mode);
  if (mode === 'code') {
    return ['code', 'test', '--sarif-file-output=snyk-results/code.sarif'];
  }
  if (mode === 'monitor') return ['monitor', ...discoveryArgs];
  // A partially scanned repository must not pass, even if other projects have findings.
  return ['test', ...discoveryArgs, '--fail-fast',
    '--json-file-output=snyk-results/test.json',
    '--sarif-file-output=snyk-results/test.sarif'];
}

export function scanResult(mode, exitCode) {
  validateMode(mode);
  if (exitCode === 0) return 'clean';
  // Monitor uploads a snapshot; exit 1 is an upload failure, not a finding.
  if (exitCode === 1 && mode !== 'monitor') return 'findings';
  return 'error';
}

export async function runScan(mode, {
  workingDirectory = process.cwd(),
  outputPath = process.env.GITHUB_OUTPUT,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  executable = 'snyk',
  prefixArgs = [],
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const args = scanArguments(mode);
  const files = scanFiles(mode, workingDirectory);
  checkArtifactTarget(files.directory, true);
  mkdirSync(files.directory, { recursive: true });
  for (const [key, file] of Object.entries(files)) {
    if (key !== 'directory') checkArtifactTarget(file);
  }
  const log = createWriteStream(files.log);
  // Attach error handling before streaming so filesystem errors cannot be lost.
  const logFinished = finished(log);
  logFinished.catch(() => {});
  const child = spawn(executable, [...prefixArgs, ...args], {
    cwd: workingDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { stdout.write(chunk); log.write(chunk); });
  child.stderr.on('data', (chunk) => { stderr.write(chunk); log.write(chunk); });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  const exitCode = await new Promise((resolve) => {
    child.on('close', (code, signal) => {
      if (spawnError || signal) {
        const message = `Snyk ${mode} could not complete: ${spawnError?.message ?? signal}\n`;
        stderr.write(message);
        log.write(message);
      }
      resolve(spawnError || signal ? 2 : (code ?? 2));
    });
  });
  log.end();
  await logFinished;
  const result = scanResult(mode, exitCode);
  writeFileSync(files.status,
    `${JSON.stringify({ mode, exitCode, result }, null, 2)}\n`);
  if (outputPath) appendFileSync(outputPath, `exit-code=${exitCode}\nresult=${result}\n`);
  if (summaryPath) {
    appendFileSync(summaryPath, `### Snyk ${mode}\n\nResult: **${result}** (exit code ${exitCode}). `
      + `See the \`snyk-results\` artifact for logs and available reports.\n\n`);
  }
  if (result !== 'clean') {
    stderr.write(result === 'findings'
      ? `::error::Snyk ${mode} reported security findings (exit code ${exitCode}).\n`
      : `::error::Snyk ${mode} failed to complete (exit code ${exitCode}); coverage is not complete.\n`);
  }
  return { exitCode, result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { exitCode } = await runScan(process.argv[2]);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 2;
  }
}
