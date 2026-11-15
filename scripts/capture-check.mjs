import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const checks = {
  format: { file: 'oxfmt-output.txt', commands: [['oxfmt', 'oxfmt', '--check', '.']] },
  lint: { file: 'oxlint-report.json', commands: [['oxlint', 'oxlint', '--deny-warnings', '--format', 'json', '.']] },
  typecheck: { file: 'typescript-output.txt', commands: [['next', 'next', 'typegen'], ['typescript', 'tsc', '--noEmit']] },
};

// Fixed operations, native Node executable, argument vectors, and a bounded
// process lifetime. Never invoke npm's Windows batch wrapper through a shell.
export function captureCheck(mode, { cwd = process.cwd(), run = spawnSync, timeout = 300_000, stdout = process.stdout } = {}) {
  if (!Object.hasOwn(checks, mode)) throw new Error('Unknown quality check');
  const check = checks[mode];
  let output = '';
  let status = 0;
  for (const [packageName, command, ...args] of check.commands) {
    try {
      const manifest = JSON.parse(readFileSync(join(cwd, 'node_modules', packageName, 'package.json'), 'utf8'));
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[command];
      const result = run(process.execPath, [join(cwd, 'node_modules', packageName, bin), ...args], {
        cwd, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 20 * 1024 * 1024, shell: false,
      });
      // Keep lint stdout as machine-readable JSON; stderr goes to the Actions log.
      output += result.stdout || '';
      stdout.write((result.stdout || '') + (result.stderr || ''));
      status = result.error || result.signal || !Number.isInteger(result.status) ? 2 : result.status;
      if (mode !== 'lint') output += result.stderr || '';
    } catch {
      status = 2;
      if (mode !== 'lint') output += 'Quality checker could not start.\n';
    }
    if (status !== 0) break;
    // Successful type generation can print progress; only tsc emits diagnostics.
    if (mode === 'typecheck') output = '';
  }
  if (mode === 'format') output += `\nOXFMT_EXIT_CODE=${status}\n`;
  writeFileSync(join(cwd, check.file), output);
  writeFileSync(join(cwd, `${mode}-status.json`), JSON.stringify({ exitCode: status }));
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = captureCheck(process.argv[2]);
