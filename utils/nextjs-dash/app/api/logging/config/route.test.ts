import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';

vi.mock('@/lib/serverLogger', () => ({
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('/api/logging/config route', () => {
  it('returns defaults when env vars are missing', async () => {
    delete process.env.NEXTJS_DASH_CLIENT_LOG_LEVEL;
    delete process.env.NEXTJS_DASH_SERVER_LOG_LEVEL;

    const req = new NextRequest('http://localhost/api/logging/config', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const json = (await res.json()) as { clientLogLevel: string; serverLogLevel: string };
    expect(json.clientLogLevel).toBe(DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel);
    expect(json.serverLogLevel).toBe(DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel);
  });

  it('uses env vars when set (and normalizes)', async () => {
    process.env.NEXTJS_DASH_CLIENT_LOG_LEVEL = 'DEBUG';
    process.env.NEXTJS_DASH_SERVER_LOG_LEVEL = 'warn';

    const req = new NextRequest('http://localhost/api/logging/config', { method: 'GET' });
    const res = await GET(req);

    const json = (await res.json()) as { clientLogLevel: string; serverLogLevel: string };
    expect(json.clientLogLevel).toBe('debug');
    expect(json.serverLogLevel).toBe('warn');
  });
});

