/**
 * Server-side scoped logger wrapper.
 *
 * We keep using the underlying serverLogger so:
 * - logs still go to stdout/stderr for container logs
 * - logs still go into the server log buffer for the UI
 * - request correlation (rid) is preserved
 */

import { serverLogger } from '@/lib/serverLogger';

export type ScopedServerLogger = typeof serverLogger;

export function createScopedServerLogger(scope: string): ScopedServerLogger {
  const prefix = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => serverLogger.debug(prefix, ...args),
    info: (...args: unknown[]) => serverLogger.info(prefix, ...args),
    warn: (...args: unknown[]) => serverLogger.warn(prefix, ...args),
    error: (...args: unknown[]) => serverLogger.error(prefix, ...args),
  } as const;
}

