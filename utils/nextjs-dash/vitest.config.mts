import { defineConfig } from 'vitest/config';
import { sharedResolve } from './vitest.config.shared.mts';

// Default Vitest config (kept for editor integration).
// CI/local scripts use split configs:
// - vitest.config.node.mts
// - vitest.config.dom.mts
export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: 'jsdom',
    globals: true,
    isolate: true,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: ['@mui/material', 'react-transition-group'],
      },
    },
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
  },
});
