/**
 * Client-side logger wrapper.
 *
 * Goals:
 * - Standardize prefixes so logs are searchable.
 * - Keep using console.* so our console-capture (client logs UI) continues to work.
 * - Avoid any heavy dependencies.
 */

type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

type ClientLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type { ClientLogger };

const levelOrder = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
} as const;

type RuntimeClientLogLevel = keyof typeof levelOrder;

declare global {
  // Persist across HMR in dev.
  var __NEXTJS_DASH_CLIENT_LOG_LEVEL__: RuntimeClientLogLevel | undefined;
}

export function setClientLogLevel(level: RuntimeClientLogLevel) {
  globalThis.__NEXTJS_DASH_CLIENT_LOG_LEVEL__ = level;
}

export function getClientLogLevel(): RuntimeClientLogLevel {
  return globalThis.__NEXTJS_DASH_CLIENT_LOG_LEVEL__ ?? 'info';
}

function formatPrefix(scope: string) {
  return `[client][${scope}]`;
}

function shouldLog(level: ClientLogLevel): boolean {
  return levelOrder[level] >= levelOrder[getClientLogLevel()];
}

function write(level: ClientLogLevel, prefix: string, args: unknown[]) {
  if (!shouldLog(level)) return;
  const payload = [prefix, ...args] as const;
  switch (level) {
    case 'error':
      console.error(...payload);
      break;
    case 'warn':
      console.warn(...payload);
      break;
    case 'debug':
      console.debug(...payload);
      break;
    default:
      console.log(...payload);
  }
}

export function createClientLogger(scope: string): ClientLogger {
  const prefix = formatPrefix(scope);
  return {
    debug: (...args: unknown[]) => write('debug', prefix, args),
    info: (...args: unknown[]) => write('info', prefix, args),
    warn: (...args: unknown[]) => write('warn', prefix, args),
    error: (...args: unknown[]) => write('error', prefix, args),
  };
}

// A default logger for quick one-offs.
// (Intentionally not exported to avoid unused-export linting/typecheck noise.)
// const clientLogger = createClientLogger('app');
