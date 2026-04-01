import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Node test suite: pure library and API-route unit tests that do NOT need JSDOM.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: true,

    // Only node-safe tests.
    include: ['lib/**/*.test.{ts,tsx}', 'app/api/**/*.test.{ts,tsx}'],

    // Keep it modest; node tests are cheap and benefit less from large worker counts.
    pool: 'threads',
    fileParallelism: true,
    maxWorkers: 4,

    // Coverage via @vitest/coverage-v8.
    // Output goes to coverage/node/ so it can be merged with the DOM run.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/node',
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/node_modules/**',
        // Pure type definitions / static defaults — no executable logic.
        'lib/runtimeConfigTypes.ts',
        'lib/loggingTypes.ts',
      ],
    },
  },
});

