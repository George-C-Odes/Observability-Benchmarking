import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { logServer } from './serverLogger';

describe('serverLogger output mode', () => {
  const originalLevel = globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__;
  const originalOutput = globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__;

  beforeEach(() => {
    // Ensure logs are not gated.
    globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__ = 'debug';

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
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

    // First arg is prefix string (maybe empty), then original args.
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
