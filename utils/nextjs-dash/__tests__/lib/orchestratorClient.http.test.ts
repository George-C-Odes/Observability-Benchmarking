import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  orchestratorConfig: {
    url: 'http://orchestrator:3002',
    apiKey: 'secret-token',
    timeout: 60000,
  },
}));

import {
  getBenchmarkTargets,
  getCommandPresets,
  getEnvFile,
  getJobStatusWithRunId,
  orchestratorGet,
  orchestratorPost,
  submitCommand,
  submitCommandWithRunId,
  updateBenchmarkTargets,
  updateEnvFile,
} from '@/lib/orchestratorClient';

describe('orchestratorClient HTTP helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('performs GET requests with request-id propagation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(orchestratorGet('/v1/health', false, 'rid-123')).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith('http://orchestrator:3002/v1/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Request-Id': 'rid-123',
      },
    });
  });

  it('performs authenticated POST requests and throws on upstream errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('busy', { status: 503 }));

    await expect(orchestratorPost('/v1/run', { command: 'echo hi' }, true, 'rid-456')).resolves.toEqual({
      jobId: 'job-1',
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(1, 'http://orchestrator:3002/v1/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer secret-token',
        'X-Request-Id': 'rid-456',
      },
      body: JSON.stringify({ command: 'echo hi' }),
    });

    await expect(orchestratorPost('/v1/run', { command: 'echo hi' })).rejects.toThrow(
      'Orchestrator POST /v1/run failed (503): busy',
    );
  });

  it('uses helper wrappers for submit and job-status requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-submit' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-run', runId: 'run-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobId: 'job-1', status: 'RUNNING' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(submitCommand('docker compose ps')).resolves.toEqual({ jobId: 'job-submit' });
    await expect(submitCommandWithRunId('docker compose up', 'run-1', 'rid-789')).resolves.toEqual({
      jobId: 'job-run',
      runId: 'run-1',
    });
    await expect(getJobStatusWithRunId('job-1', 'run/value', 'rid-status')).resolves.toEqual({
      jobId: 'job-1',
      status: 'RUNNING',
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'http://orchestrator:3002/v1/run', expect.objectContaining({
      body: JSON.stringify({ command: 'docker compose up', runId: 'run-1' }),
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'http://orchestrator:3002/v1/jobs/job-1?runId=run%2Fvalue',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-Request-Id': 'rid-status' }),
      }),
    );
  });

  it('uses helper wrappers for env and benchmark-target endpoints', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ title: 'OBS', command: 'docker compose up', category: 'multi-cont' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'HOST_REPO: /repo' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ urls: ['http://go:8080/hello/virtual'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await expect(getCommandPresets()).resolves.toHaveLength(1);
    await expect(getEnvFile()).resolves.toEqual({ content: 'HOST_REPO: /repo' });
    await expect(updateEnvFile('HOST_REPO: /changed')).resolves.toBeUndefined();
    await expect(getBenchmarkTargets()).resolves.toEqual({ urls: ['http://go:8080/hello/virtual'] });
    await expect(updateBenchmarkTargets(['http://go:8080/hello/virtual'])).resolves.toBeUndefined();
  });
});

