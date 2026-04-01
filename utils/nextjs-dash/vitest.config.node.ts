import { defineConfig } from 'vitest/config';
import { sharedResolve, sharedTestOptions, sharedCoverageExclude } from './vitest.config.shared';

// Node test suite: pure library and API-route unit tests that do NOT need JSDOM.
export default defineConfig({
  resolve: sharedResolve,
  test: {
    ...sharedTestOptions,
    environment: 'node',

    // Only node-safe tests (all tests live under __tests__/).
    include: ['__tests__/lib/**/*.test.{ts,tsx}', '__tests__/app/api/**/*.test.{ts,tsx}'],

    // Coverage via @vitest/coverage-v8.
    // Output goes to coverage/node/ so it can be merged with the DOM run.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/node',
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: [
        ...sharedCoverageExclude,
        // Pure type definitions / static defaults — no executable logic.
        'lib/runtimeConfigTypes.ts',
        'lib/loggingTypes.ts',
      ],
    },
  },
});