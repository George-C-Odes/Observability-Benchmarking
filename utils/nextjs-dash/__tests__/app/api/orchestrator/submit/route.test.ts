import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/orchestratorClient', () => ({
  submitCommandWithRunId: vi.fn(),
}));

vi.mock('@/lib/scriptRunnerRunState', () => ({
  setActiveRunId: vi.fn(),
}));

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import * as orch from '@/lib/orchestratorClient';
import * as runState from '@/lib/scriptRunnerRunState';
import { POST } from '@/app/api/orchestrator/submit/route';

describe('/api/orchestrator/submit route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 400 when command is missing', async () => {
    const req = new NextRequest('http://localhost/api/orchestrator/submit', {
      method: 'POST',
      body: JSON.stringify({ runId: 'run-1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'command is required' });
  });

  it('registers the active run and returns the submitted job id', async () => {
    vi.mocked(orch.submitCommandWithRunId).mockResolvedValue({ jobId: 'job-123', runId: 'run-1' });

    const req = new NextRequest('http://localhost/api/orchestrator/submit', {
      method: 'POST',
      body: JSON.stringify({ command: 'docker compose up', runId: 'run-1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(runState.setActiveRunId).toHaveBeenCalledWith('run-1');
    expect(orch.submitCommandWithRunId).toHaveBeenCalledWith('docker compose up', 'run-1', expect.any(String));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ jobId: 'job-123', requestId: expect.any(String) });
  });

  it('maps orchestrator busy responses to 503', async () => {
    vi.mocked(orch.submitCommandWithRunId).mockRejectedValue(new Error('Orchestrator POST /v1/run failed (503): busy'));

    const req = new NextRequest('http://localhost/api/orchestrator/submit', {
      method: 'POST',
      body: JSON.stringify({ command: 'docker compose up' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'orchestrator_busy',
      message: 'Orchestrator is busy running another job. Try again shortly.',
    });
  });

  it('returns 502 when orchestrator omits the job id', async () => {
    vi.mocked(orch.submitCommandWithRunId).mockResolvedValue({ jobId: '' });

    const req = new NextRequest('http://localhost/api/orchestrator/submit', {
      method: 'POST',
      body: JSON.stringify({ command: 'docker compose ps' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: 'orchestrator_submit_failed',
      message: 'No jobId returned from orchestrator.',
    });
  });
});

