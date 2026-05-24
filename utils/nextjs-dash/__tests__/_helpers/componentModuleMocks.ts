import { vi } from 'vitest';

/**
 * Shared module mock payloads for DOM component tests.
 *
 * These are intentionally consumed via dynamic import inside `vi.mock(async () => …)`
 * factories so the same mocks can be reused without running into Vitest hoisting
 * constraints for top-level static imports.
 */
export const CLIENT_LOGGER_MODULE_MOCK = {
  createClientLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
};

export const INWARD_PULSE_MODULE_MOCK = {
  InwardPulse: () => null,
};

export const TIMED_PULSE_MODULE_MOCK = {
  useTimedPulse: () => ({ on: false, fire: vi.fn() }),
};