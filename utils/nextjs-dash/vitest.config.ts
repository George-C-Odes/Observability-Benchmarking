import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Default Vitest config (kept for editor integration).
// CI/local scripts use split configs:
// - vitest.config.node.ts
// - vitest.config.dom.ts
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
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
});
