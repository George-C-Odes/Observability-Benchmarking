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
  },
});

