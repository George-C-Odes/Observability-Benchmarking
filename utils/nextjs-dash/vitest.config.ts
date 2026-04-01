import { defineConfig } from 'vitest/config';
import { sharedResolve } from './vitest.config.shared';

// Default Vitest config (kept for editor integration).
// CI/local scripts use split configs:
// - vitest.config.node.ts
// - vitest.config.dom.ts
export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});