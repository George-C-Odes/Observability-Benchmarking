import sonarjs from 'eslint-plugin-sonarjs';

export default [{
  files: ['**/*.mjs'],
  plugins: { sonarjs },
  linterOptions: { noInlineConfig: true },
  rules: {
    'sonarjs/cognitive-complexity': ['error', 15],
    'no-control-regex': 'error',
  },
}];
