import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerLogBuffer } from '@/lib/logBuffer';

describe('logBuffer', () => {
  afterEach(() => {
    globalThis.__NEXTJS_DASH_LOG_BUFFER__ = undefined;
    vi.unstubAllEnvs();
  });

  it.each(['2', 'invalid', '0', '-1', 'Infinity', ''])(
    'uses a valid env capacity or the default (%s)',
    (capacity) => {
      globalThis.__NEXTJS_DASH_LOG_BUFFER__ = undefined;
      vi.stubEnv('APP_LOGS_SERVER_MAX_ENTRIES', capacity);
      const buffer = getServerLogBuffer();
      for (let ts = 1; ts <= 2001; ts++) {
        buffer.add({ ts, level: 'info', source: 'server', message: String(ts) });
      }
      const expectedSize = capacity === '2' ? 2 : 2000;
      expect(buffer.snapshot()).toHaveLength(expectedSize);
      expect(buffer.snapshot()[0].ts).toBe(2002 - expectedSize);
      expect(getServerLogBuffer()).toBe(buffer);
    },
  );

  it('stores entries and can snapshot sinceTs', () => {
    const buffer = getServerLogBuffer();
    buffer.clear();

    const t1 = Date.now();
    buffer.add({ ts: t1, level: 'info', source: 'server', message: 'one' });
    buffer.add({ ts: t1 + 5, level: 'info', source: 'server', message: 'two' });

    expect(buffer.snapshot().length).toBe(2);
    expect(buffer.snapshot({ sinceTs: t1 }).map((e) => e.message)).toEqual(['two']);
  });
});
