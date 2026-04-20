import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/orchestratorClient', () => ({
  getJobStatusWithRunId: vi.fn(),
}));

vi.mock('@/lib/scriptRunnerRunState', () => ({
  getActiveRunId: vi.fn(),
}));

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import * as orch from '@/lib/orchestratorClient';
import * as runState from '@/lib/scriptRunnerRunState';
import { GET } from '@/app/api/orchestrator/status/route';

describe('/api/orchestrator/status route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(runState.getActiveRunId).mockReturnValue('run-active');
  });

  it('returns 400 when jobId is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/orchestrator/status'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'jobId is required' });
  });

  it('rejects stale run requests before calling orchestrator', async () => {
    const res = await GET(new NextRequest('http://localhost/api/orchestrator/status?jobId=job-1&runId=run-stale'));

    expect(orch.getJobStatusWithRunId).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'stale_run',
      message: 'This status polling request is for a stale run.',
    });
  });

  it('returns job status for the active run', async () => {
    vi.mocked(orch.getJobStatusWithRunId).mockResolvedValue({
      jobId: 'job-1',
      status: 'RUNNING',
    });

    const req = new NextRequest('http://localhost/api/orchestrator/status?jobId=job-1&runId=run-active', {
      headers: { 'x-request-id': 'rid-123' },
    });
    const res = await GET(req);

    expect(orch.getJobStatusWithRunId).toHaveBeenCalledWith('job-1', 'run-active', 'rid-123');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ jobId: 'job-1', status: 'RUNNING' });
  });

  it('maps orchestrator stale-run conflicts to 409', async () => {
    vi.mocked(orch.getJobStatusWithRunId).mockRejectedValue(new Error('failed (409): stale'));

    const res = await GET(new NextRequest('http://localhost/api/orchestrator/status?jobId=job-1'));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'stale_run',
      message: 'This status request is for a stale run/job.',
    });
  });
});

