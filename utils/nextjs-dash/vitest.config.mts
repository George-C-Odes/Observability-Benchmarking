import { defineConfig } from 'vitest/config';

// Editor, watch, and CLI runs share the same environment boundaries.
// Coverage uses the individual configs so the reports remain disjoint.
export default defineConfig({
  test: { projects: ['./vitest.config.node.mts', './vitest.config.dom.mts'] },
});
