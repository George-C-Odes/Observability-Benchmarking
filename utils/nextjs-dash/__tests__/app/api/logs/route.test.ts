import { describe, expect, it, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getServerLogBuffer } from '@/lib/logBuffer';

import { GET, DELETE } from '@/app/api/logs/route';

describe('/api/logs route', () => {
  beforeEach(() => {
    getServerLogBuffer().clear();
  });

  it('GET returns empty entries when buffer is empty', async () => {
    const req = new NextRequest('http://localhost/api/logs', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: unknown[] };
    expect(json.entries).toEqual([]);
  });

  it('GET returns all buffered entries', async () => {
    const buffer = getServerLogBuffer();
    buffer.add({ ts: 100, level: 'info', source: 'server', message: 'one' });
    buffer.add({ ts: 200, level: 'warn', source: 'server', message: 'two' });

    const req = new NextRequest('http://localhost/api/logs', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: { message: string }[] };
    expect(json.entries).toHaveLength(2);
    expect(json.entries[0].message).toBe('one');
    expect(json.entries[1].message).toBe('two');
  });

  it('GET filters entries by sinceTs query param', async () => {
    const buffer = getServerLogBuffer();
    buffer.add({ ts: 100, level: 'info', source: 'server', message: 'old' });
    buffer.add({ ts: 200, level: 'info', source: 'server', message: 'new' });

    const req = new NextRequest('http://localhost/api/logs?sinceTs=100', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: { message: string }[] };
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].message).toBe('new');
  });

  it('GET ignores invalid sinceTs gracefully', async () => {
    const buffer = getServerLogBuffer();
    buffer.add({ ts: 100, level: 'info', source: 'server', message: 'msg' });

    const req = new NextRequest('http://localhost/api/logs?sinceTs=notanumber', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: { message: string }[] };
    expect(json.entries).toHaveLength(1);
  });

  it('DELETE clears the buffer', async () => {
    const buffer = getServerLogBuffer();
    buffer.add({ ts: 100, level: 'info', source: 'server', message: 'msg' });

    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    expect(buffer.snapshot()).toHaveLength(0);
  });
});