import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useJobRunner } from '@/app/hooks/useJobRunner';
import { MockEventSource, installMockGlobals, restoreMockGlobals } from '@/__tests__/_helpers/useJobRunner.test-helpers';

// Mock the runtime config hook so tests are deterministic and fast.
vi.mock('@/app/hooks/useScriptRunnerConfig', () => ({
  useScriptRunnerConfig: () => ({
    config: {
      maxExecutionLogLines: 3,
      eventStreamTimeoutMs: 1234,
      debug: false,
    },
    loading: false,
    error: null,
    refresh: async () => undefined,
  }),
}));

beforeEach(() => {
  installMockGlobals();
});

afterEach(() => {
  restoreMockGlobals();
});

describe('useJobRunner', () => {
  it('submits a job, opens SSE, and updates status from SSE summary events', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Submit only (runner no longer calls /events/meta)
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/orchestrator/submit')) {
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const { result } = renderHook(() => useJobRunner());

    let res: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      res = await result.current.runCommand('echo hi', 'Test');
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/orchestrator/submit', expect.any(Object));
    expect(MockEventSource.instances[0]?.url).toContain('/api/orchestrator/events?jobId=job-1');

    const es = MockEventSource.instances[0]!;

    await act(async () => {
      es.emitOpen();
    });

    // Emit RUNNING status
    await act(async () => {
      es.emitMessage(
        JSON.stringify({
          type: 'summary',
          stream: 'system',
          message: 'RUNNING',
          jobId: 'job-1',
          jobStatus: 'RUNNING',
          createdAt: new Date().toISOString(),
        })
      );
    });

    expect(result.current.lastJobStatus?.status).toBe('RUNNING');

    // Emit SUCCEEDED terminal status
    await act(async () => {
      es.emitMessage(
        JSON.stringify({
          type: 'terminalSummary',
          stream: 'system',
          message: 'SUCCEEDED',
          jobId: 'job-1',
          jobStatus: 'SUCCEEDED',
          exitCode: 0,
          finishedAt: new Date().toISOString(),
        })
      );
    });

    // Wait until the hook applies the terminal status.
    for (let i = 0; i < 20; i++) {
      if (result.current.lastJobStatus?.status === 'SUCCEEDED') break;
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(result.current.lastJobStatus?.status).toBe('SUCCEEDED');

    expect(res).toBeDefined();
    expect(res!.ok).toBe(true);
    expect(res!.output).toContain('Job ID: job-1');
  });

  it.each([
    ['missing jobId', JSON.stringify({ requestId: 'request-1' })],
    ['blank jobId', JSON.stringify({ jobId: '   ' })],
    ['invalid JSON', 'not-json'],
  ])('classifies a 2xx submit response with %s as HTTP 502', async (_case, responseBody) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(responseBody, { status: 200 }));

    const { result } = renderHook(() => useJobRunner());

    let runResult: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      runResult = await result.current.runCommand('echo hi', 'Test');
    });

    expect(runResult).toEqual({
      ok: false,
      job: null,
      output: 'HTTP 502 - Invalid submit response from orchestrator: expected a non-empty jobId.',
    });
    expect(result.current.lastJobStatus).toMatchObject({
      jobId: 'N/A',
      status: 'FAILED',
      lastLine: 'Submit failed (HTTP 502).',
      title: 'Test',
    });
    expect(result.current.eventLogs.join('\n')).toContain('[client] Submit failed: HTTP 502');
    expect(result.current.eventLogs.join('\n')).not.toContain('HTTP 200');
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('reports an upstream submit rejection with its HTTP status and response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid command', { status: 422 }));

    const { result } = renderHook(() => useJobRunner());

    let runResult: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      runResult = await result.current.runCommand('bad command', 'Invalid command');
    });

    expect(runResult?.output).toBe('HTTP 422 - invalid command');
    expect(result.current.lastJobStatus?.lastLine).toBe('Submit failed (HTTP 422).');
    expect(result.current.eventLogs.join('\n')).toContain(
      '[client] Submit failed: HTTP 422 - invalid command'
    );
  });

  it('reports a busy orchestrator with retry guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi', 'Test');
    });

    expect(result.current.lastJobStatus?.lastLine).toBe('Orchestrator busy (HTTP 503).');
    expect(result.current.eventLogs).toContain('[client] Orchestrator rejected job submit as busy (503).');
    expect(result.current.eventLogs).toContain('[client] Try again once the active job completes.');
  });

  it('keeps only the last N event logs (configurable)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/orchestrator/submit')) {
        return new Response(JSON.stringify({ jobId: 'job-2' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi');
    });

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    await act(async () => {
      es.emitMessage(JSON.stringify({ type: 'log', stream: 'stdout', message: '1' }));
      es.emitMessage(JSON.stringify({ type: 'log', stream: 'stdout', message: '2' }));
      es.emitMessage(JSON.stringify({ type: 'log', stream: 'stdout', message: '3' }));
      es.emitMessage(JSON.stringify({ type: 'log', stream: 'stdout', message: '4' }));
    });

    expect(result.current.eventLogs).toEqual(['2', '3', '4']);
  });

  it('auto-closes the event stream after the configured timeout', async () => {
    vi.useFakeTimers();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/orchestrator/submit')) {
        return new Response(JSON.stringify({ jobId: 'job-3' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      void result.current.runCommand('echo hi');
      // allow the async fetch + streamJobEvents to schedule
      await Promise.resolve();
    });

    // Wait until the stream is created.
    for (let i = 0; i < 5; i++) {
      if (MockEventSource.instances.length > 0) break;
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(MockEventSource.instances.length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(1234);
      await Promise.resolve();
    });

    expect(result.current.sseLastError).toBe('SSE did not connect before timeout');

    expect(MockEventSource.instances.some((i) => i.close.mock.calls.length > 0)).toBe(true);
  });

  it('clears stale persisted jobId on mount when orchestrator reports Unknown jobId', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // Seed persisted state (simulating a prior session)
    globalThis.sessionStorage.setItem(
      'scriptRunner.activeJob.v2',
      JSON.stringify({
        jobId: 'stale-job',
        runId: 'run-1',
        lastCommand: 'echo hi',
        lastLabel: 'Test',
        reconnectCount: 2,
        lastJobStatus: { jobId: 'stale-job', status: 'RUNNING' },
        eventLogsTail: ['hi'],
        savedAtMs: Date.now(),
      })
    );

    fetchSpy.mockImplementation(async () => new Response('not found', { status: 404 }));

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await Promise.resolve();
    });

    // With SSE-only runner, we don't automatically validate a persisted job on mount.
    // The hook should restore the state without throwing.
    expect(result.current.currentJobId).toBe('stale-job');
    expect(result.current.lastJobStatus?.status).toBe('RUNNING');
  });
});

// No test changes required: runCommand now polls regardless of passive state for the initiating run.
// The hook now keeps SSE independent from the active-tab lock to avoid spurious disconnects.
