import sonarjs from 'eslint-plugin-sonarjs';

export default [{
  files: ['**/*.mjs'],
  plugins: { sonarjs },
  linterOptions: { noInlineConfig: true },
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
}];
