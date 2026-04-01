import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/logging/config/route';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';

// noinspection JSUnusedGlobalSymbols — mock consumed by vi.mock, not test code
const serverLoggerMock = vi.hoisted(() => ({
  serverLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/serverLogger', () => serverLoggerMock);

describe('/api/logging/config route', () => {
  it('returns defaults when env vars are missing', async () => {
    delete process.env.NEXTJS_DASH_CLIENT_LOG_LEVEL;
    delete process.env.NEXTJS_DASH_SERVER_LOG_LEVEL;
    delete process.env.NEXTJS_DASH_SERVER_LOG_OUTPUT;

    const req = new NextRequest('http://localhost/api/logging/config', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const json = (await res.json()) as { clientLogLevel: string; serverLogLevel: string; serverLogOutput: string };
    expect(json.clientLogLevel).toBe(DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel);
    expect(json.serverLogLevel).toBe(DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel);
    expect(json.serverLogOutput).toBe(DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogOutput);
  });

  it('uses env vars when set (and normalizes)', async () => {
    process.env.NEXTJS_DASH_CLIENT_LOG_LEVEL = 'DEBUG';
    process.env.NEXTJS_DASH_SERVER_LOG_LEVEL = 'warn';
    process.env.NEXTJS_DASH_SERVER_LOG_OUTPUT = 'PLAIN';

    const req = new NextRequest('http://localhost/api/logging/config', { method: 'GET' });
    const res = await GET(req);

    const json = (await res.json()) as { clientLogLevel: string; serverLogLevel: string; serverLogOutput: string };
    expect(json.clientLogLevel).toBe('debug');
    expect(json.serverLogLevel).toBe('warn');
    expect(json.serverLogOutput).toBe('plain');
  });
});