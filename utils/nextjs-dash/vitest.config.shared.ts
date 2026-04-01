/**
 * Shared Vitest configuration options.
 *
 * Both `vitest.config.node.ts` and `vitest.config.dom.ts` spread from
 * this base, removing duplication of resolve aliases, pool settings,
 * and common exclude patterns.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Derive this file's directory from `import.meta.url` instead of relying on
 * `import.meta.dirname` (Node ≥ 21.2 only). This keeps the `@` alias stable
 * regardless of the working directory or Node version.
 */
const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve alias shared across all test configs. */
export const sharedResolve = {
  alias: {
    '@': dirname,
  },
} as const;

/** Common coverage excludes (test files, node_modules). */
export const sharedCoverageExclude: string[] = [
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
  '**/node_modules/**',
];

/** Common test options shared across node and DOM configs. */
export const sharedTestOptions = {
  globals: true as const,
  pool: 'threads' as const,
  fileParallelism: true,
  maxWorkers: 4,
};