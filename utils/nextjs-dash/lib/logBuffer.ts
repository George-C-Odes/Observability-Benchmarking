export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BufferedLogEntry {
  ts: number; // epoch millis
  level: LogLevel;
  source: 'server' | 'client';
  message: string;
  meta?: unknown;
}

/**
 * Very small in-memory ring buffer for logs.
 *
 * Notes:
 * - This is best-effort and process-local. In serverless/edge it won't be reliable.
 * - For our docker-compose dev environment it's good enough.
 */
class LogBuffer {
  private readonly maxEntries: number;
  private entries: BufferedLogEntry[] = [];

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  add(entry: BufferedLogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  snapshot(opts?: { sinceTs?: number }) {
    const sinceTs = opts?.sinceTs;
    return sinceTs ? this.entries.filter((e) => e.ts > sinceTs) : [...this.entries];
  }

  clear() {
    this.entries = [];
  }
}

declare global {
  // Persist across HMR in dev
  var __NEXTJS_DASH_LOG_BUFFER__: LogBuffer | undefined;
}

function readMaxEntriesFromEnv(defaultValue: number): number {
  const raw = process.env.APP_LOGS_SERVER_MAX_ENTRIES;
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

export function getServerLogBuffer(opts?: { maxEntries?: number }) {
  if (!globalThis.__NEXTJS_DASH_LOG_BUFFER__) {
    const max = opts?.maxEntries ?? readMaxEntriesFromEnv(2000);
    globalThis.__NEXTJS_DASH_LOG_BUFFER__ = new LogBuffer(max);
  }
  return globalThis.__NEXTJS_DASH_LOG_BUFFER__;
}

export function resetServerLogBufferForTests() {
  // Useful in unit tests to ensure a fresh buffer when env changes.
  globalThis.__NEXTJS_DASH_LOG_BUFFER__ = undefined;
}
