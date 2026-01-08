import type { LogLevel } from './logBuffer';
import { getServerLogBuffer } from './logBuffer';
import { getRequestId } from './requestContext';

function formatArgs(args: unknown[]): { message: string; meta?: unknown } {
  // Keep the message readable, but don't lose objects.
  const parts: string[] = [];
  const meta: unknown[] = [];

  for (const a of args) {
    if (typeof a === 'string') {
      parts.push(a);
    } else if (a instanceof Error) {
      parts.push(a.message);
      meta.push({ name: a.name, message: a.message, stack: a.stack });
    } else {
      try {
        parts.push(JSON.stringify(a));
      } catch {
        parts.push(String(a));
      }
      meta.push(a);
    }
  }

  const message = parts.join(' ');
  return meta.length ? { message, meta } : { message };
}

export function logServer(level: LogLevel, ...args: unknown[]) {
  const { message, meta } = formatArgs(args);
  const requestId = getRequestId();

  getServerLogBuffer().add({
    ts: Date.now(),
    level,
    source: 'server',
    message,
    meta: requestId ? { requestId, meta } : meta,
  });

  // Still write to stdout/stderr so container logs remain useful.
  const prefix = requestId ? `[rid:${requestId}]` : '';

  switch (level) {
    case 'error':
      console.error(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    case 'debug':
      console.debug(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
}

export const serverLogger = {
  debug: (...args: unknown[]) => logServer('debug', ...args),
  info: (...args: unknown[]) => logServer('info', ...args),
  warn: (...args: unknown[]) => logServer('warn', ...args),
  error: (...args: unknown[]) => logServer('error', ...args),
} as const;
