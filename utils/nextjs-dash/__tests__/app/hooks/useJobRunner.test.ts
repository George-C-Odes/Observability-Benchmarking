import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useJobRunner } from '@/app/hooks/useJobRunner';
import {
  MockEventSource,
  installMockGlobals,
  restoreMockGlobals,
} from '@/__tests__/_helpers/useJobRunner.test-helpers';

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
        }),
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
        }),
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

    await act(async () => {
      es.emitMessage(
        JSON.stringify({
          type: 'summary',
          jobId: 'job-1',
          jobStatus: 'RUNNING',
        }),
      );
    });

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('invalid command', { status: 422 }),
    );

    const { result } = renderHook(() => useJobRunner());

    let runResult: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      runResult = await result.current.runCommand('bad command', 'Invalid command');
    });

    expect(runResult?.output).toBe('HTTP 422 - invalid command');
    expect(result.current.lastJobStatus?.lastLine).toBe('Submit failed (HTTP 422).');
    expect(result.current.eventLogs.join('\n')).toContain(
      '[client] Submit failed: HTTP 422 - invalid command',
    );
  });

  it('reports a busy orchestrator with retry guidance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi', 'Test');
    });

    expect(result.current.lastJobStatus?.lastLine).toBe('Orchestrator busy (HTTP 503).');
    expect(result.current.eventLogs).toContain(
      '[client] Orchestrator rejected job submit as busy (503).',
    );
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

  it('formats SSE messages and ignores events belonging to another job', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-events' }), { status: 200 }),
    );

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi', 'Test');
    });

    const es = MockEventSource.instances[0]!;
    await act(async () => {
      es.emitMessage(JSON.stringify({ type: 'log', stream: 'stderr', message: 'warning' }));
      es.emitMessage(JSON.stringify({ type: 'status', message: ' RUNNING ' }));
      es.emitMessage(JSON.stringify({ type: 'status', message: ': heartbeat' }));
      es.emitMessage('unstructured output');
      es.emitMessage(
        JSON.stringify({ type: 'log', jobId: 'different-job', message: 'must be ignored' }),
      );
    });

    expect(result.current.eventLogs).toEqual([
      '[stderr] warning',
      '[status] RUNNING',
      'unstructured output',
    ]);
  });

  it.each(['available', 'server error', 'network error'] as const)(
    'reconnects after a transient event-stream failure when metadata is %s',
    async (metaState) => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/api/orchestrator/submit')) {
            return new Response(JSON.stringify({ jobId: 'job-reconnect' }), { status: 200 });
          }
          if (metaState === 'network error') {
            throw new Error('metadata unavailable');
          }
          if (metaState === 'server error') {
            return new Response('temporarily unavailable', { status: 500 });
          }
          return new Response(null, { status: 200 });
        });

      const { result } = renderHook(() => useJobRunner());

      await act(async () => {
        await result.current.runCommand('echo hi', 'Test');
      });

      await act(async () => {
        MockEventSource.instances[0].emitMessage(
          JSON.stringify({ type: 'status', message: ': heartbeat', requestId: 'request-9' }),
        );
        MockEventSource.instances[0].emitError();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/orchestrator/events/meta?jobId=job-reconnect'),
        { cache: 'no-store' },
      );
      expect(result.current.sseLastError).toBe('SSE connection error');
      expect(result.current.reconnectCount).toBe(1);
      expect(result.current.eventLogs.join('\n')).toContain('Reconnecting... rid=request-9');

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1].url).toContain('jobId=job-reconnect');
    },
  );

  it('reset clears persisted state and closes the active event stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-reset' }), { status: 200 }),
    );

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi', 'Reset test');
      MockEventSource.instances[0].emitOpen();
    });
    expect(globalThis.sessionStorage.getItem('scriptRunner.activeJob.v2')).not.toBeNull();

    const es = MockEventSource.instances[0];
    act(() => {
      result.current.reset();
      es.emitOpen();
      es.emitMessage(JSON.stringify({ type: 'log', message: 'late output' }));
      es.emitError();
    });

    expect(es.close).toHaveBeenCalled();
    expect(globalThis.sessionStorage.getItem('scriptRunner.activeJob.v2')).toBeNull();
    expect(result.current.currentJobId).toBeNull();
    expect(result.current.lastJobStatus).toBeNull();
    expect(result.current.lastCommand).toBeNull();
    expect(result.current.lastLabel).toBeNull();
    expect(result.current.eventLogs).toEqual([]);
    expect(result.current.reconnectCount).toBe(0);
    expect(result.current.sseConnected).toBe(false);
    expect(result.current.sseLastError).toBeNull();
  });

  it('surfaces a failure to construct the event stream', async () => {
    globalThis.EventSource = class {
      constructor() {
        throw new Error('EventSource unavailable');
      }
    } as unknown as typeof EventSource;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-no-stream' }), { status: 200 }),
    );

    const { result } = renderHook(() => useJobRunner());

    let runResult: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      runResult = await result.current.runCommand('echo hi', 'Test');
    });

    expect(runResult?.ok).toBe(true);
    expect(result.current.sseLastError).toBe('Failed to open SSE');
    expect(result.current.eventLogs).toContain(
      '[client] Failed to open orchestrator event stream.',
    );
  });

  it('returns a failed result and restores executing state after a submit network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useJobRunner());

    let runResult: import('@/app/hooks/useJobRunner').RunResult | undefined;
    await act(async () => {
      runResult = await result.current.runCommand('echo hi', 'Test');
    });

    expect(runResult).toEqual({ ok: false, job: null, output: 'Error: network down' });
    expect(result.current.executing).toBe(false);
    expect(MockEventSource.instances).toHaveLength(0);
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

  it('restores an active persisted job and reconnects its event stream', async () => {
    vi.useFakeTimers();
    globalThis.sessionStorage.setItem(
      'scriptRunner.activeJob.v2',
      JSON.stringify({
        jobId: 'stale-job',
        runId: 'run-1',
        lastCommand: 'echo hi',
        lastLabel: 'Test',
        reconnectCount: 2,
        lastJobStatus: { jobId: 'stale-job', status: 'RUNNING' },
        eventLogsTail: ['first', 'second', 'third'],
        savedAtMs: Date.now(),
      }),
    );

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.currentJobId).toBe('stale-job');
    expect(result.current.lastJobStatus?.status).toBe('RUNNING');
    expect(result.current.eventLogs).toEqual([
      'third',
      '[client] Restored active job from session: stale-job. Reconnecting...',
      expect.stringContaining('[client] Opening event stream: '),
    ]);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain('jobId=stale-job&runId=run-1');
  });

  it('restores a completed persisted job without reconnecting', async () => {
    vi.useFakeTimers();
    globalThis.sessionStorage.setItem(
      'scriptRunner.activeJob.v2',
      JSON.stringify({
        jobId: 'completed-job',
        runId: 'run-complete',
        lastCommand: 'echo done',
        lastLabel: 'Completed test',
        reconnectCount: 1,
        lastJobStatus: { jobId: 'completed-job', status: 'SUCCEEDED', exitCode: 0 },
        eventLogsTail: ['one', 'two', 'three', 'four'],
        savedAtMs: Date.now(),
      }),
    );

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.currentJobId).toBe('completed-job');
    expect(result.current.lastJobStatus).toMatchObject({ status: 'SUCCEEDED', exitCode: 0 });
    expect(result.current.lastCommand).toBe('echo done');
    expect(result.current.lastLabel).toBe('Completed test');
    expect(result.current.eventLogs).toEqual(['two', 'three', 'four']);
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
