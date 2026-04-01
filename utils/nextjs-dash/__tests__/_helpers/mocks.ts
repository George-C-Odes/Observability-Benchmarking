/**
 * Shared mock factories for common module-level vi.mock() patterns.
 *
 * **Important**: `vi.mock()` factories are hoisted above imports, so you
 * cannot directly import from this file and use the values in a factory.
 * Instead, use `vi.hoisted()` to create synchronous inline mocks using
 * the same patterns documented here, or import them for non-factory usage.
 *
 * **Pattern A — vi.hoisted (recommended for vi.mock factories)**:
 * ```ts
 * const serverLoggerMock = vi.hoisted(() => ({
 *   serverLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
 * }));
 * vi.mock('@/lib/serverLogger', () => serverLoggerMock);
 * ```
 *
 * **Pattern B — direct import (safe for non-factory usage)**:
 * ```ts
 * import { CLIENT_LOGGER_MOCK } from '@/__tests__/_helpers/mocks';
 * // use in beforeEach, assertions, etc. — NOT inside vi.mock(() => ...)
 * ```
 */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// clientLogger mock (used by component tests that transitively import it)
// ---------------------------------------------------------------------------

/** Factory return for `vi.mock('@/lib/clientLogger', () => CLIENT_LOGGER_MOCK)`. */
export const CLIENT_LOGGER_MOCK = {
  createClientLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
};

// ---------------------------------------------------------------------------
// serverLogger mock (used by API route tests)
// ---------------------------------------------------------------------------

/** Factory return for `vi.mock('@/lib/serverLogger', () => SERVER_LOGGER_MOCK)`. */
export const SERVER_LOGGER_MOCK = {
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
};

// ---------------------------------------------------------------------------
// InwardPulse + useTimedPulse (used by component tests with pulsing UI)
// ---------------------------------------------------------------------------

/** Factory return for `vi.mock('@/app/components/ui/InwardPulse', …)`. */
export const INWARD_PULSE_MOCK = {
  InwardPulse: () => null,
};

/** Factory return for `vi.mock('@/app/hooks/useTimedPulse', …)`. */
export const TIMED_PULSE_MOCK = {
  useTimedPulse: () => ({ on: false, fire: vi.fn() }),
};