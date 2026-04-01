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

    // Only DOM-requiring tests (all tests live under __tests__/).
    include: [
      '__tests__/app/components/**/*.test.{ts,tsx}',
      '__tests__/app/hooks/**/*.test.{ts,tsx}',
      '__tests__/app/*.test.{ts,tsx}',   // theme.test.ts, Providers.test.tsx
    ],

    // JSDOM is heavy. Too many workers on Windows can hurt wall time.
    // Tune locally via: npx vitest run -c vitest.config.dom.ts --maxWorkers=N
    pool: 'threads',
    fileParallelism: true,
    maxWorkers: 4,

    // Coverage via @vitest/coverage-v8.
    // Output goes to coverage/dom/ so it can be merged with the Node run.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/dom',
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      include: [
        'app/components/**/*.{ts,tsx}',
        'app/hooks/**/*.ts',
        'app/theme.ts',        // client-side theme logic
        'app/Providers.tsx',   // client-side context / theme wiring
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/node_modules/**',
        // Inline <Script> components inject raw JS strings via
        // dangerouslySetInnerHTML — they need a real browser, not jsdom.
        'app/components/PreHydrationScript.tsx',
        'app/components/RuntimeConfigScript.tsx',
        // Side-effect-only component (returns null). Testing would just
        // mock every dependency; no meaningful assertions possible.
        'app/components/BootLogger.tsx',
      ],
    },
  },
});