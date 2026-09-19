import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerLogBuffer } from '@/lib/logBuffer';
import { GET } from '@/app/api/logs/stream/route';

describe('/api/logs/stream route', () => {
  beforeEach(() => {
    getServerLogBuffer().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replays buffered entries, follows new entries, pings, and cleans up on abort', async () => {
    const intervalCallbacks: Array<() => void> = [];
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      callback: () => void,
    ) => {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    }) as typeof setInterval);
    const clearIntervalSpy = vi
      .spyOn(globalThis, 'clearInterval')
      .mockImplementation(() => undefined);

    const buffer = getServerLogBuffer();
    buffer.add({ ts: 100, level: 'info', source: 'server', message: 'old' });
    buffer.add({ ts: 200, level: 'warn', source: 'server', message: 'replayed' });

    const abortController = new AbortController();
    const request = new NextRequest('http://localhost/api/logs/stream?sinceTs=100', {
      signal: abortController.signal,
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const replay = decoder.decode((await reader.read()).value);
    expect(replay).toContain('"message":"replayed"');
    expect(replay).not.toContain('"message":"old"');

    buffer.add({ ts: 300, level: 'error', source: 'server', message: 'followed' });
    intervalCallbacks[1]();
    expect(decoder.decode((await reader.read()).value)).toContain('"message":"followed"');

    intervalCallbacks[0]();
    expect(decoder.decode((await reader.read()).value)).toBe(': ping\n\n');

    abortController.abort();
    expect((await reader.read()).done).toBe(true);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
  });

  it('treats an invalid sinceTs as an unfiltered replay', async () => {
    vi.spyOn(globalThis, 'setInterval').mockImplementation(
      (() => 1) as unknown as typeof setInterval,
    );
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    getServerLogBuffer().add({ ts: 100, level: 'info', source: 'server', message: 'visible' });

    const abortController = new AbortController();
    const response = await GET(
      new NextRequest('http://localhost/api/logs/stream?sinceTs=invalid', {
        signal: abortController.signal,
      }),
    );
    const reader = response.body!.getReader();

    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"message":"visible"');
    abortController.abort();
  });
});
