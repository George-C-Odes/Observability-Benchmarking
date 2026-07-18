import nextVitals from 'eslint-config-next/core-web-vitals';

/**
 * Flat ESLint config (ESLint v9) for this Next.js app.
 */
const config = [
  // Global ignores (must be top-level so ESLint skips walking these trees)
  {
    ignores: [
      '**/.next/**',
      '.next/**',
      '**/node_modules/**',
      'node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      // Standalone output (if built)
      '**/.output/**',
      '**/build/**',
    ],
  },

  ...nextVitals,

  // Server-only (route handlers, libs used server-side): allow Node globals
  {
    files: ['app/api/**/*.{js,ts}', 'lib/**/*.{js,ts}', 'next.config.*', '*.config.*'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      // Some server-side files legitimately use require (e.g. reading package.json)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default config;

