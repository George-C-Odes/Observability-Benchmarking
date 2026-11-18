import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

export function scriptLinter() {
  return new ESLint({
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    overrideConfigFile: fileURLToPath(new URL('./eslint.config.mjs', import.meta.url)),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const linter = scriptLinter();
  const results = await linter.lintFiles([
    'scripts/capture-check.mjs',
    'scripts/qodana-project.mjs',
    'scripts/sonar-coverage.mjs',
    'scripts/pages/assemble-reports.mjs',
    'scripts/pages/github-reports.mjs',
    'scripts/pages/generate-nextjs-quality-report.mjs',
  ]);
  console.log(await (await linter.loadFormatter('stylish')).format(results));
  process.exitCode = results.some((result) => result.errorCount || result.warningCount) ? 1 : 0;
}
