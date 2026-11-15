import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useJobEventStream } from '@/app/hooks/useJobEventStream';
import type { JobTransport } from '@/lib/jobRunner/transport';
import { MockEventSource } from '@/__tests__/_helpers/useJobRunner.test-helpers';
import { createMockStorage } from '@/__tests__/_helpers/storage';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('sessionStorage', createMockStorage());
  const meta = Promise.withResolvers<Awaited<ReturnType<JobTransport['checkStreamMeta']>>>();
  const source = new MockEventSource('test');
  const transport: JobTransport = {
    checkStreamMeta: vi.fn(() => meta.promise),
    submitJobCommand: vi.fn(),
    openEventStream: vi.fn(() => ({ source: source as unknown as EventSource, url: 'test' })),
  };
  const setLastJobStatus = vi.fn();
  const appendLog = vi.fn();
  const options = {
    transport,
    timeoutMs: 5000,
    initialReconnectCount: 0,
    lastLabel: null,
    appendLog,
    setLastJobStatus,
    runningJobIdRef: { current: 'job-1' as string | null },
    jobGenerationRef: { current: 1 },
    runIdRef: { current: null },
  };
  const hook = renderHook(() => useJobEventStream(options));
  act(() => hook.result.current.streamJobEvents('job-1', 1));
  act(() => source.emitError());
  expect(transport.checkStreamMeta).toHaveBeenCalledOnce();
  return { ...hook, source, meta, transport, setLastJobStatus, appendLog };
}

describe('useJobEventStream session cleanup', () => {
  it.each([200, 404, 409])('ignores deferred metadata status %i after unmount', async (status) => {
    const { unmount, meta, transport, setLastJobStatus, appendLog } = setup();
    unmount();
    // A new runner may have persisted its state before the old request resolves.
    sessionStorage.setItem('scriptRunner.activeJob.v2', 'new runner state');
    appendLog.mockClear();
    await act(async () => {
      meta.resolve({ ok: status === 200, status, txt: '' });
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(setLastJobStatus).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
    expect(transport.openEventStream).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('scriptRunner.activeJob.v2')).toBe('new runner state');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores old metadata when the same job gets a new stream session', async () => {
    const { result, meta, transport, setLastJobStatus } = setup();
    act(() => result.current.streamJobEvents('job-1', 1));
    await act(async () => {
      meta.resolve({ ok: false, status: 404, txt: '' });
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(setLastJobStatus).not.toHaveBeenCalled();
    expect(transport.openEventStream).toHaveBeenCalledTimes(2);
  });
});
