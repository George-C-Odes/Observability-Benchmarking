import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';
import { DEFAULT_APP_LOGS_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';

vi.mock('@/lib/serverLogger', () => ({
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('/api/app-logs/config route', () => {
  it('returns defaults when env vars are missing', async () => {
    delete process.env.APP_LOGS_CLIENT_MAX_ENTRIES;
    delete process.env.APP_LOGS_SERVER_MAX_ENTRIES;

    const req = new NextRequest('http://localhost/api/app-logs/config', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const json = (await res.json()) as { clientMaxEntries: number; serverMaxEntries: number };
    expect(json.clientMaxEntries).toBe(DEFAULT_APP_LOGS_RUNTIME_CONFIG.clientMaxEntries);
    expect(json.serverMaxEntries).toBe(DEFAULT_APP_LOGS_RUNTIME_CONFIG.serverMaxEntries);
  });

  it('uses env vars when set', async () => {
    process.env.APP_LOGS_CLIENT_MAX_ENTRIES = '111';
    process.env.APP_LOGS_SERVER_MAX_ENTRIES = '222';

    const req = new NextRequest('http://localhost/api/app-logs/config', { method: 'GET' });
    const res = await GET(req);
    const json = (await res.json()) as { clientMaxEntries: number; serverMaxEntries: number };

    expect(json.clientMaxEntries).toBe(111);
    expect(json.serverMaxEntries).toBe(222);
  });
});
