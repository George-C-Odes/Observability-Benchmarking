/**
 * Silences all four console output methods to prevent noise in test output
 * and returns spies for assertion.
 *
 * Typical usage:
 * ```ts
 * beforeEach(() => { silenceConsole(); });
 * ```
 *
 * The spies are automatically restored when `vi.restoreAllMocks()` is called
 * in `afterEach`, so there is no need to manually restore them.
 */
import { vi } from 'vitest';

export interface ConsoleSpy {
  log: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
  debug: ReturnType<typeof vi.spyOn>;
}

/**
 * Spies on `console.log`, `.warn`, `.error`, and `.debug` with no-op
 * implementations.  Returns the four spy references for assertions.
 */
export function silenceConsole(): ConsoleSpy {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  };
}