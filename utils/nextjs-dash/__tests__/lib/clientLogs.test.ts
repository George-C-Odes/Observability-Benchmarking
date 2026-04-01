import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  installConsoleCapture,
  subscribeClientLogs,
  clearClientLogs,
  setClientLogsMaxEntries,
  type ClientLogEntry,
} from '@/lib/clientLogs';
import { silenceConsole } from '@/__tests__/_helpers/consoleSpy';

// Helper to reset the global state between tests.
function resetGlobalState() {
  globalThis.__NEXTJS_DASH_CLIENT_LOGS__ = undefined;
}

describe('clientLogs', () => {
  beforeEach(() => {
    resetGlobalState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore console if capture was installed.
    const c = console as { __nextjsDashRestore__?: () => void };
    if (typeof c.__nextjsDashRestore__ === 'function') {
      c.__nextjsDashRestore__();
    }
    resetGlobalState();
  });

  describe('subscribeClientLogs', () => {
    it('delivers current entries on subscribe and unsubscribe stops delivery', () => {
      const received: ClientLogEntry[][] = [];
      const unsub = subscribeClientLogs((entries) => received.push(entries));

      // First call delivers the (empty) snapshot.
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual([]);

      unsub();

      // After unsubscribe further notifications should not reach us.
      // We trigger a notification by clearing.
      clearClientLogs();
      expect(received).toHaveLength(1); // still 1
    });
  });

  describe('installConsoleCapture', () => {
    beforeEach(() => {
      silenceConsole();
    });

    it('captures console.log as info entries', () => {
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      installConsoleCapture();

      console.log('hello');
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].level).toBe('info');
      expect(received[0][0].message).toBe('hello');
    });

    it('captures console.warn as warn entries', () => {
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      installConsoleCapture();

      console.warn('caution');
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].level).toBe('warn');
    });

    it('captures console.error as error entries', () => {
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      installConsoleCapture();

      console.error('fail');
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].level).toBe('error');
    });

    it('captures console.debug as debug entries', () => {
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      installConsoleCapture();

      console.debug('trace');
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].level).toBe('debug');
    });

    it('is idempotent (second call is a no-op)', () => {
      installConsoleCapture();
      installConsoleCapture(); // should not double-wrap
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      console.log('once');
      // Only one entry, not two.
      expect(received[0]).toHaveLength(1);
    });
  });

  describe('append serialization', () => {
    beforeEach(() => {
      silenceConsole();
    });

    it('serializes Error to stack/message', () => {
      installConsoleCapture();
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      const err = new Error('oops');
      console.error(err);
      expect(received[0][0].message).toContain('oops');
    });

    it('serializes objects to JSON', () => {
      installConsoleCapture();
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      console.log({ key: 'val' });
      expect(received[0][0].message).toBe('{"key":"val"}');
    });

    it('falls back to String() for circular objects', () => {
      installConsoleCapture();
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      console.log(circular);
      expect(received[0][0].message).toBe('[object Object]');
    });

    it('joins multiple args with spaces', () => {
      installConsoleCapture();
      const received: ClientLogEntry[][] = [];
      subscribeClientLogs((entries) => {
        received.length = 0;
        received.push(entries);
      });

      console.log('hello', 'world', 42);
      expect(received[0][0].message).toBe('hello world 42');
    });
  });

  describe('clearClientLogs', () => {
    beforeEach(() => {
      silenceConsole();
    });

    it('clears all entries and notifies subscribers', () => {
      installConsoleCapture();
      console.log('entry1');
      console.log('entry2');

      let latest: ClientLogEntry[] = [];
      subscribeClientLogs((entries) => {
        latest = entries;
      });
      expect(latest).toHaveLength(2);

      clearClientLogs();
      expect(latest).toHaveLength(0);
    });
  });

  describe('setClientLogsMaxEntries', () => {
    beforeEach(() => {
      silenceConsole();
    });

    it('trims existing entries when max is reduced', () => {
      installConsoleCapture();
      for (let i = 0; i < 10; i++) console.log(`msg-${i}`);

      let latest: ClientLogEntry[] = [];
      subscribeClientLogs((entries) => {
        latest = entries;
      });
      expect(latest).toHaveLength(10);

      setClientLogsMaxEntries(3);
      expect(latest).toHaveLength(3);
      expect(latest[0].message).toBe('msg-7');
    });

    it('ignores invalid values (zero, negative, Infinity)', () => {
      setClientLogsMaxEntries(0);
      setClientLogsMaxEntries(-1);
      setClientLogsMaxEntries(Infinity);
      // No crash — just a no-op.
    });

    it('enforces new max on subsequent appends', () => {
      setClientLogsMaxEntries(2);
      installConsoleCapture();

      console.log('a');
      console.log('b');
      console.log('c');

      let latest: ClientLogEntry[] = [];
      subscribeClientLogs((entries) => {
        latest = entries;
      });
      expect(latest).toHaveLength(2);
      expect(latest[0].message).toBe('b');
      expect(latest[1].message).toBe('c');
    });
  });
});