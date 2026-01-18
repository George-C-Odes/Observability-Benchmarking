import { describe, expect, it } from 'vitest';
import { getServerLogBuffer } from './logBuffer';

describe('logBuffer', () => {
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

