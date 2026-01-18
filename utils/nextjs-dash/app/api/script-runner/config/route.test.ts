import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Route under test
import { GET } from './route';
import { DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';

// Keep test output quiet
vi.mock('@/lib/serverLogger', () => ({
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('/api/script-runner/config route', () => {
  it('returns defaults when env vars are missing', async () => {
    delete process.env.SCRIPT_RUNNER_EXEC_LOG_MAX_LINES;
    delete process.env.SCRIPT_RUNNER_EVENT_STREAM_TIMEOUT_MS;

    const req = new NextRequest('http://localhost/api/script-runner/config', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const json = (await res.json()) as { maxExecutionLogLines: number; eventStreamTimeoutMs: number; debug: boolean };
    expect(json.maxExecutionLogLines).toBe(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.maxExecutionLogLines);
    expect(json.eventStreamTimeoutMs).toBe(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.eventStreamTimeoutMs);
    expect(json.debug).toBe(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.debug);
  });

  it('uses env vars when set', async () => {
    process.env.SCRIPT_RUNNER_EXEC_LOG_MAX_LINES = '123';
    process.env.SCRIPT_RUNNER_EVENT_STREAM_TIMEOUT_MS = '456';

    const req = new NextRequest('http://localhost/api/script-runner/config', { method: 'GET' });
    const res = await GET(req);
    const json = (await res.json()) as { maxExecutionLogLines: number; eventStreamTimeoutMs: number; debug: boolean };

    expect(json.maxExecutionLogLines).toBe(123);
    expect(json.eventStreamTimeoutMs).toBe(456);
    expect(json.debug).toBe(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.debug);
  });
});
