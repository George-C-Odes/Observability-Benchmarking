import type { LogLevel } from './logBuffer';

export interface ClientLogEntry {
  ts: number;
  level: Extract<LogLevel, 'info' | 'warn' | 'error' | 'debug'>;
  message: string;
}

type Subscriber = (entries: ClientLogEntry[]) => void;

declare global {
  // Persist across HMR in dev
  var __NEXTJS_DASH_CLIENT_LOGS__:
    | {
        entries: ClientLogEntry[];
        subscribers: Set<Subscriber>;
        installed: boolean;
        maxEntries: number;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__NEXTJS_DASH_CLIENT_LOGS__) {
    globalThis.__NEXTJS_DASH_CLIENT_LOGS__ = {
      entries: [],
      subscribers: new Set(),
      installed: false,
      maxEntries: 1000,
    };
  }
  return globalThis.__NEXTJS_DASH_CLIENT_LOGS__;
}

function notify() {
  const s = getState();
  for (const sub of s.subscribers) {
    sub([...s.entries]);
  }
}

function append(level: ClientLogEntry['level'], args: unknown[]) {
  const s = getState();
  const message = args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');

  s.entries.push({ ts: Date.now(), level, message });
  if (s.entries.length > s.maxEntries) {
    s.entries = s.entries.slice(s.entries.length - s.maxEntries);
  }
  notify();
}

interface RestoreCapableConsole extends Console {
  __nextjsDashRestore__?: () => void;
}

export function installConsoleCapture() {
  const s = getState();
  if (s.installed) return;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    append('info', args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    append('warn', args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    append('error', args);
  };

  console.debug = (...args: unknown[]) => {
    originalDebug(...args);
    append('debug', args);
  };

  // Expose a best-effort restore hook for tests.
  (console as RestoreCapableConsole).__nextjsDashRestore__ = () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.debug = originalDebug;
  };

  s.installed = true;
}

export function subscribeClientLogs(subscriber: Subscriber) {
  const s = getState();
  s.subscribers.add(subscriber);
  subscriber([...s.entries]);
  return () => {
    s.subscribers.delete(subscriber);
  };
}

export function clearClientLogs() {
  const s = getState();
  s.entries = [];
  notify();
}
