import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextPlugin from '@next/eslint-plugin-next';
import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Flat ESLint config (ESLint v9) for this Next.js app.
 */
export default [
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

  eslintJs.configs.recommended,

  // Apply TypeScript rules only to TS/TSX
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['**/*.{ts,tsx}'],
  })),

  // Next.js + React rules
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

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
