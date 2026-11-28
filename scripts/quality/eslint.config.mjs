import regexp from 'eslint-plugin-regexp';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  { ignores: ['scripts/**/*.test.mjs'] },
  {
    files: ['scripts/**/*.mjs'],
    plugins: { regexp },
    linterOptions: { noInlineConfig: true },
    // The pinned SonarJS slow-regex rule reports exponential cases only.
    rules: { 'regexp/no-super-linear-backtracking': 'error' },
  },
  {
    files: [
      'scripts/capture-check.mjs',
      'scripts/scanners/qodana-project.mjs',
      'scripts/scanners/semgrep-report.mjs',
      'scripts/coverage/sonar-coverage.mjs',
      'scripts/ci/workflow-action-versions.mjs',
      'scripts/versions/python-lock-relay.mjs',
      'scripts/pages/assemble-reports.mjs',
      'scripts/pages/github-reports.mjs',
      'scripts/pages/generate-nextjs-quality-report.mjs',
    ],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'no-control-regex': 'error',
      // S2871 requires type services in SonarJS. Enforce the explicit-comparator
      // contract syntactically here so the plain-JavaScript gate cannot skip it.
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[arguments.length=0] > MemberExpression.callee[property.name=/^(sort|toSorted)$/], CallExpression[arguments.length=0] > MemberExpression.callee[property.value=/^(sort|toSorted)$/]',
        message: 'Provide an explicit comparator for sort/toSorted (Sonar S2871).',
      }],
    },
  },
];
