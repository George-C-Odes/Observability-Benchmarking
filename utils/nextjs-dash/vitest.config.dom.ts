import { defineConfig } from 'vitest/config';
import { sharedResolve, sharedTestOptions, sharedCoverageExclude } from './vitest.config.shared';

// DOM/UI test suite: component and hook tests that rely on React Testing Library + JSDOM.
export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTestOptions,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],

    // Only DOM-requiring tests (all tests live under __tests__/).
    include: [
      '__tests__/app/components/**/*.test.{ts,tsx}',
      '__tests__/app/hooks/**/*.test.{ts,tsx}',
      '__tests__/app/*.test.{ts,tsx}',   // theme.test.ts, Providers.test.tsx
    ],

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
        ...sharedCoverageExclude,
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