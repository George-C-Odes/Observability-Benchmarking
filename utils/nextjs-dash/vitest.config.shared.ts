/**
 * Shared Vitest configuration options.
 *
 * Both `vitest.config.node.ts` and `vitest.config.dom.ts` spread from
 * this base, eliminating duplication of resolve aliases, pool settings,
 * and common exclude patterns.
 */
import path from 'node:path';

const dirname = path.resolve(import.meta.dirname ?? '.');

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