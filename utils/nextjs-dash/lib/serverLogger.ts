import type { LogLevel } from './logBuffer';
import { getServerLogBuffer } from './logBuffer';
import { getRequestId } from './requestContext';
import type { RuntimeLogLevel, ServerLogOutput } from './loggingTypes';

const levelOrder: Record<RuntimeLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

declare global {
  var __NEXTJS_DASH_SERVER_LOG_LEVEL__: RuntimeLogLevel | undefined;
  var __NEXTJS_DASH_SERVER_LOG_OUTPUT__: ServerLogOutput | undefined;
}

export function getServerLogLevel(): RuntimeLogLevel {
  return globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__ ?? 'info';
}

export function getServerLogOutput(): ServerLogOutput {
  return globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ ?? 'json';
}

function shouldLog(level: LogLevel): boolean {
  // LogLevel is debug|info|warn|error.
  return levelOrder[level] >= levelOrder[getServerLogLevel()];
}

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
  if (!shouldLog(level)) return;
  const { message, meta } = formatArgs(args);
  const requestId = getRequestId();

  getServerLogBuffer().add({
    ts: Date.now(),
    level,
    source: 'server',
    message,
    meta: requestId ? { requestId, meta } : meta,
  });

  const output = getServerLogOutput();
  if (output === 'plain') {
    // Legacy/human-friendly mode.
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
    return;
  }

  // Structured mode (default): emit a single JSON line per log.
  // This makes Grafana/Alloy able to set detected_level correctly.
  const payload = {
    ts: new Date().toISOString(),
    level,
    source: 'nextjs-dash',
    requestId: requestId ?? undefined,
    message,
    meta: meta ?? undefined,
  };

  const line = JSON.stringify(payload);

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export const serverLogger = {
  debug: (...args: unknown[]) => logServer('debug', ...args),
  info: (...args: unknown[]) => logServer('info', ...args),
  warn: (...args: unknown[]) => logServer('warn', ...args),
  error: (...args: unknown[]) => logServer('error', ...args),
} as const;
