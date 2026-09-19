import { vi } from 'vitest';

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
