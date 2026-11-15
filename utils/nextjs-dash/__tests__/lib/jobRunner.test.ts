import { afterEach, describe, expect, it, vi } from 'vitest';
import { processSseEvent } from '@/lib/jobRunner/events';
import { classifyMetaFailure, getNextJobStatus, type JobStatus } from '@/lib/jobRunner/model';
import { getRestoredJobState, writePersistedState } from '@/lib/jobRunner/storage';
import { createJobTransport } from '@/lib/jobRunner/transport';
import { computeReconnectDelay, getCryptoRandom } from '@/lib/jobRunner/random';
import { createMockStorage } from '@/__tests__/_helpers/storage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('job event handling', () => {
  function callbacks() {
    return { onRequestId: vi.fn(), onSummary: vi.fn(), onLog: vi.fn(), onRaw: vi.fn() };
  }
  it.each(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'])(
    'accepts %s snapshots with typed metadata',
    (status) => {
      const handlers = callbacks();
      processSseEvent(
        JSON.stringify({
          type: 'terminalSummary',
          jobId: 'job-1',
          jobStatus: status,
          title: ' Title ',
          lastLine: 'last',
          exitCode: 1,
          requestId: 'rid',
        }),
        'job-1',
        handlers,
      );
      expect(handlers.onSummary).toHaveBeenCalledWith(
        expect.objectContaining({ status, title: 'Title', lastLine: 'last', exitCode: 1 }),
        true,
      );
      expect(handlers.onRequestId).toHaveBeenCalledWith('rid');
    },
  );
  it('keeps optional metadata undefined and rejects unknown statuses and other jobs', () => {
    const handlers = callbacks();
    processSseEvent(
      JSON.stringify({
        type: 'summary',
        jobStatus: 'RUNNING',
        title: ' ',
        lastLine: 42,
        exitCode: null,
      }),
      'job-1',
      handlers,
    );
    expect(handlers.onSummary).toHaveBeenCalledWith(
      expect.objectContaining({ title: undefined, lastLine: undefined, exitCode: undefined }),
      false,
    );
    handlers.onSummary.mockClear();
    for (const event of [
      { type: 'summary', jobStatus: 'invalid' },
      { type: 'summary', jobId: 'other', jobStatus: 'RUNNING' },
      {},
    ])
      processSseEvent(JSON.stringify(event), 'job-1', handlers);
    expect(handlers.onSummary).not.toHaveBeenCalled();
  });
  it('formats logs and status, preserves raw text and ignores empty messages and heartbeats', () => {
    const handlers = callbacks();
    for (const event of [
      '',
      'unstructured',
      JSON.stringify({ type: 'log', message: 'out' }),
      JSON.stringify({ type: 'log', stream: 'stderr', message: 'err' }),
      JSON.stringify({ type: 'log' }),
      JSON.stringify({ type: 'status', message: ' RUNNING ' }),
      JSON.stringify({ type: 'status', message: ': ping' }),
      JSON.stringify({ type: 'status', message: '' }),
      JSON.stringify({ type: 'status' }),
    ])
      processSseEvent(event, 'job-1', handlers);
    expect(handlers.onRaw).toHaveBeenCalledExactlyOnceWith('unstructured');
    expect(handlers.onLog.mock.calls).toEqual([
      ['out'],
      ['[stderr] err'],
      [''],
      ['[status] RUNNING'],
    ]);
  });
  it.each(['other.job', '../job-1', '', ' ', false, {}, 42, 'job-1\n', 'other-job'])(
    'rejects explicitly invalid or mismatched event job ID %j before any dispatch',
    (jobId) => {
      const handlers = callbacks();
      for (const type of ['terminalSummary', 'summary', 'log', 'status']) {
        processSseEvent(
          JSON.stringify({
            type,
            jobId,
            jobStatus: 'SUCCEEDED',
            requestId: 'rid',
            message: 'hello',
          }),
          'job-1',
          handlers,
        );
      }
      for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
    },
  );
  it.each([null, undefined])('accepts log/status events with an absent job ID (%j)', (jobId) => {
    const handlers = callbacks();
    processSseEvent(
      JSON.stringify({ type: 'log', jobId, stream: 'stderr', message: 'output', requestId: 'rid' }),
      'job-1',
      handlers,
    );
    processSseEvent(
      JSON.stringify({ type: 'status', jobId, message: ' RUNNING ', requestId: 'rid' }),
      'job-1',
      handlers,
    );
    expect(handlers.onLog.mock.calls).toEqual([['[stderr] output'], ['[status] RUNNING']]);
    expect(handlers.onRequestId.mock.calls).toEqual([['rid'], ['rid']]);
    expect(handlers.onSummary).not.toHaveBeenCalled();
    expect(handlers.onRaw).not.toHaveBeenCalled();
  });
  it('keeps terminal state against late events and ignores a previous job', () => {
    const completed: JobStatus = { jobId: 'job-1', status: 'SUCCEEDED' };
    const running: JobStatus = { jobId: 'job-1', status: 'RUNNING' };
    expect(getNextJobStatus(completed, running, 'job-1', false, 'job-1', true)).toBe(completed);
    expect(getNextJobStatus(completed, running, 'job-1', true, 'new-job', false)).toBe(completed);
    expect(getNextJobStatus(null, running, 'job-1', false, 'job-1', false)).toBe(running);
  });
  it.each([
    [409, 'stale run'],
    [404, 'no longer available'],
    [401, 'validation failed'],
    [500, null],
    [0, null],
  ])('classifies metadata status %s', (status, reason) => {
    const result = classifyMetaFailure(Number(status), 'details');
    if (reason) expect(result?.reason).toContain(reason);
    else expect(result).toBeNull();
  });
});

describe('job persistence', () => {
  it('restores an active job with defaults and limits the log tail', () => {
    vi.stubGlobal('sessionStorage', createMockStorage());
    sessionStorage.setItem(
      'scriptRunner.activeJob.v2',
      JSON.stringify({ jobId: ' job-1 ', eventLogsTail: ['a', 'b', 'c'] }),
    );
    expect(getRestoredJobState(2)).toEqual({
      jobId: 'job-1',
      runId: null,
      lastCommand: null,
      lastLabel: null,
      reconnectCount: 0,
      lastJobStatus: null,
      eventLogs: ['c', expect.stringContaining('Reconnecting')],
      shouldReconnect: true,
    });
  });
  it.each(['SUCCEEDED', 'FAILED', 'CANCELED'] as const)(
    'restores %s without reconnecting and clears persisted state',
    (status) => {
      vi.stubGlobal('sessionStorage', createMockStorage());
      writePersistedState({
        jobId: 'job-1',
        runId: 'run-1',
        lastCommand: 'echo',
        lastLabel: 'title',
        reconnectCount: 2,
        lastJobStatus: { jobId: 'job-1', status },
        eventLogsTail: ['a', 'b', 'c'],
      });
      expect(getRestoredJobState(2)).toMatchObject({
        shouldReconnect: false,
        eventLogs: ['b', 'c'],
        lastCommand: 'echo',
        lastLabel: 'title',
        reconnectCount: 2,
      });
      writePersistedState(null);
      expect(getRestoredJobState(2)).toBeNull();
    },
  );
  it.each(['{', 'null', '42', '{}', '{"jobId":" "}', '{"jobId":"../admin"}'])(
    'rejects invalid saved data %s',
    (stored) => {
      vi.stubGlobal('sessionStorage', createMockStorage());
      sessionStorage.setItem('scriptRunner.activeJob.v2', stored);
      expect(getRestoredJobState(2)).toBeNull();
    },
  );
  it('tolerates unavailable storage and missing log tails', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(getRestoredJobState(3)).toBeNull();
    expect(() => writePersistedState({} as never)).not.toThrow();
    vi.stubGlobal('sessionStorage', createMockStorage());
    sessionStorage.setItem('scriptRunner.activeJob.v2', JSON.stringify({ jobId: 'job-1' }));
    expect(getRestoredJobState(3)?.eventLogs).toEqual([expect.stringContaining('Reconnecting')]);
  });
});

describe('job transport boundary', () => {
  it('opens a stream without an optional run ID and accepts a submit without a request ID', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ jobId: 'job-1' }));
    const open = vi.fn(() => ({}) as EventSource);
    const transport = createJobTransport(request, open);
    expect(await transport.submitJobCommand('echo', 'label', 'tab', 'run')).toEqual({
      success: true,
      jobId: 'job-1',
      requestId: undefined,
    });
    transport.openEventStream('job-1', null, 123);
    expect(open).toHaveBeenCalledExactlyOnceWith('/api/orchestrator/events?jobId=job-1&t=123');
  });
  it.each([
    '../admin',
    '%2e%2e',
    'x?admin=1',
    'x#fragment',
    'x/y',
    'x\n',
    'https://evil.example',
    '',
    '   ',
  ])('does not open requests for malicious job ID %j', async (jobId) => {
    const request = vi.fn<typeof fetch>();
    const open = vi.fn<(url: string) => EventSource>();
    const transport = createJobTransport(request, open);
    expect((await transport.checkStreamMeta(jobId, null)).status).toBe(400);
    expect(() => transport.openEventStream(jobId, null, 1)).toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
  it('keeps methods, bodies, and encoded run IDs within fixed operations', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: 'job-1', requestId: 'rid' })))
      .mockResolvedValueOnce(new Response('ok'));
    const source = {} as EventSource;
    const open = vi.fn(() => source);
    const transport = createJobTransport(request, open);
    expect(await transport.submitJobCommand('echo hi', 'label', 'tab', 'run/1')).toEqual({
      success: true,
      jobId: 'job-1',
      requestId: 'rid',
    });
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/orchestrator/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'echo hi', label: 'label', tabId: 'tab', runId: 'run/1' }),
      }),
    );
    expect(await transport.checkStreamMeta('job-1', 'run/1')).toMatchObject({ ok: true });
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/orchestrator/events/meta?jobId=job-1&runId=run%2F1',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(transport.openEventStream('job-1', 'run/1', 123)).toEqual({
      source,
      url: '/api/orchestrator/events?jobId=job-1&runId=run%2F1&t=123',
    });
  });
  it.each(['../admin', '%2fadmin', 'job?x=1', null])(
    'does not reuse malicious response-derived ID %j',
    async (jobId) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ jobId })));
      const open = vi.fn<(url: string) => EventSource>();
      const transport = createJobTransport(request, open);
      expect(await transport.submitJobCommand('echo', 'label', 'tab', 'run')).toMatchObject({
        success: false,
        status: 502,
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
    },
  );
  it('classifies submit and metadata failures, including unreadable bodies', async () => {
    const broken = new Response('', { status: 503 });
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('unreadable'));
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(broken)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('not json'));
    const transport = createJobTransport(request, vi.fn());
    expect(await transport.submitJobCommand('echo', 'label', 'tab', 'run')).toMatchObject({
      success: false,
      isBusy: true,
      message: '',
    });
    expect(await transport.checkStreamMeta('job-1', null)).toEqual({
      ok: false,
      status: 503,
      txt: '',
    });
    expect(await transport.checkStreamMeta('job-1', null)).toEqual({
      ok: false,
      status: 0,
      txt: '',
    });
    expect(await transport.submitJobCommand('echo', 'label', 'tab', 'run')).toMatchObject({
      success: false,
      status: 502,
    });
  });
});

describe('reconnection backoff', () => {
  it.each([
    [0, 250, 2000],
    [0xffffffff, 399, 2149],
  ])('bounds initial and capped delays for random sample %s', (sample, first, capped) => {
    vi.stubGlobal('crypto', {
      getRandomValues: (buffer: Uint32Array) => {
        buffer[0] = sample;
        return buffer;
      },
    });
    expect(computeReconnectDelay(1)).toBe(first);
    expect(computeReconnectDelay(100)).toBe(capped);
  });
  it.each([undefined, {}])(
    'uses deterministic jitter when crypto is unavailable (%s)',
    (crypto) => {
      vi.stubGlobal('crypto', crypto);
      expect(getCryptoRandom()).toBe(0.5);
      expect(computeReconnectDelay(2)).toBe(575);
    },
  );
});
