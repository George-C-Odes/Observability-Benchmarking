import { defineConfig } from 'vitest/config';
import path from 'node:path';

// DOM/UI test suite: component and hook tests that rely on React Testing Library + JSDOM.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    // Only DOM-requiring tests.
    include: ['app/components/**/*.test.{ts,tsx}', 'app/hooks/**/*.test.{ts,tsx}'],

    // JSDOM is heavy. Too many workers on Windows can hurt wall time.
    // Tune locally via: npx vitest run -c vitest.config.dom.ts --maxWorkers=N
    pool: 'threads',
    fileParallelism: true,
    maxWorkers: 4,
  },
});
