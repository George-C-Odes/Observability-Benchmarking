import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/__tests__/_helpers/mockScopedServerLogger';

vi.mock('@/lib/orchestratorClient', () => ({
  submitCommandWithRunId: vi.fn(),
}));

vi.mock('@/lib/scriptRunnerRunState', () => ({
  setActiveRunId: vi.fn(),
}));

import * as orch from '@/lib/orchestratorClient';
import * as runState from '@/lib/scriptRunnerRunState';
import { POST } from '@/app/api/orchestrator/submit/route';

describe('/api/orchestrator/submit route', () => {
  it('rejects malformed JSON without submitting a command', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/orchestrator/submit', { method: 'POST', body: '{' }),
    );
    expect(res.status).toBe(400);
    expect(orch.submitCommandWithRunId).not.toHaveBeenCalled();
  });

  it.each([
    [new Error('upstream unavailable'), 'upstream unavailable'],
    ['unexpected response', 'unexpected response'],
    [null, 'Orchestrator submit failed.'],
  ])('maps unexpected submit failures to 502 (%s)', async (failure, message) => {
    vi.mocked(orch.submitCommandWithRunId).mockRejectedValue(failure);
    const res = await POST(
      new NextRequest('http://localhost/api/orchestrator/submit', {
        method: 'POST',
        body: JSON.stringify({ command: 'docker compose ps' }),
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'orchestrator_submit_failed', message });
  });
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
    expect(orch.submitCommandWithRunId).toHaveBeenCalledWith(
      'docker compose up',
      'run-1',
      expect.any(String),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ jobId: 'job-123', requestId: expect.any(String) });
  });

  it('maps orchestrator busy responses to 503', async () => {
    vi.mocked(orch.submitCommandWithRunId).mockRejectedValue(
      new Error('Orchestrator POST /v1/run failed (503): busy'),
    );

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
