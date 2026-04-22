import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/scriptRunnerRunState', () => ({
  getActiveRunId: vi.fn(),
}));

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import * as runState from '@/lib/scriptRunnerRunState';
import { GET } from '@/app/api/orchestrator/events/meta/route';

describe('/api/orchestrator/events/meta route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/orchestrator/events/meta'));
    expect(res.status).toBe(400);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    await expect(res.json()).resolves.toEqual({ error: 'jobId is required' });
  });

  it('returns 404 when no active run is tracked', async () => {
    vi.mocked(runState.getActiveRunId).mockReturnValue(null);

    const res = await GET(new NextRequest('http://localhost/api/orchestrator/events/meta?jobId=job-1'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: 'no_active_run',
      message: 'No active run is tracked on the server (possible restart).',
    });
  });

  it('returns 409 for stale runIds', async () => {
    vi.mocked(runState.getActiveRunId).mockReturnValue('run-active');

    const res = await GET(new NextRequest('http://localhost/api/orchestrator/events/meta?jobId=job-1&runId=run-old'));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'stale_run',
      message: 'This events meta request is for a stale run.',
    });
  });

  it('returns request metadata for the active run', async () => {
    vi.mocked(runState.getActiveRunId).mockReturnValue('run-active');

    const res = await GET(new NextRequest('http://localhost/api/orchestrator/events/meta?jobId=job-1&runId=run-active'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toBeTruthy();

    await expect(res.json()).resolves.toEqual({
      requestId: expect.any(String),
      jobId: 'job-1',
      runId: 'run-active',
    });
  });
});

