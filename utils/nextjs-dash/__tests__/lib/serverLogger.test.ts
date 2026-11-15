import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { silenceConsole } from '@/__tests__/_helpers/consoleSpy';

import { logServer } from '@/lib/serverLogger';

describe('serverLogger output mode', () => {
  it.each(['json', 'plain'] as const)(
    'routes each level to its matching console method (%s)',
    (output) => {
      globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ = output;
      logServer('debug', 'debug message');
      logServer('info', 'info message');
      logServer('warn', 'warn message');
      logServer('error', 'error message');
      for (const [level, method] of [
        ['debug', 'debug'],
        ['info', 'log'],
        ['warn', 'warn'],
        ['error', 'error'],
      ] as const) {
        expect(console[method]).toHaveBeenCalledTimes(1);
        if (output === 'plain') {
          expect(console[method]).toHaveBeenCalledWith('', `${level} message`);
        } else {
          const [line] = vi.mocked(console[method]).mock.calls[0];
          expect(JSON.parse(String(line))).toMatchObject({
            level,
            message: `${level} message`,
            source: 'nextjs-dash',
          });
        }
      }
    },
  );

  it('defaults to info level and drops debug messages', () => {
    delete globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__;
    logServer('debug', 'hidden');
    logServer('info', 'visible');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledTimes(1);
  });
  const originalLevel = globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__;
  const originalOutput = globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__;

  beforeEach(() => {
    globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__ = 'debug';
    silenceConsole();
  });

  afterEach(() => {
    globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__ = originalLevel;
    globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ = originalOutput;

    vi.restoreAllMocks();
  });

  it('emits a single JSON line when output=json', () => {
    globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ = 'json';

    logServer('info', 'hello', { a: 1 });

    expect(console.log).toHaveBeenCalledTimes(1);
    const [line] = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(typeof line).toBe('string');

    const parsed = JSON.parse(String(line)) as { level: string; message: string; source: string };
    expect(parsed.level).toBe('info');
    expect(parsed.message).toContain('hello');
    expect(parsed.source).toBe('nextjs-dash');
  });

  it('emits legacy console args when output=plain', () => {
    globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ = 'plain';

    logServer('warn', 'hello', { a: 1 });

    expect(console.warn).toHaveBeenCalledTimes(1);
    const args = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];

    expect(args.length).toBeGreaterThanOrEqual(2);
    expect(args[1]).toBe('hello');
    expect(args[2]).toEqual({ a: 1 });
  });

  it('defaults to json when output is not set', () => {
    delete globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__;

    logServer('error', 'boom');
    expect(console.error).toHaveBeenCalledTimes(1);

    const [line] = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(() => JSON.parse(String(line))).not.toThrow();
  });
});
