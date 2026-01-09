import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useJobRunner } from './useJobRunner';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    // noop
  }

  emitMessage(data: string) {
    this.onmessage?.({ data });
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error test override
  globalThis.EventSource = MockEventSource;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useJobRunner', () => {
  it('submits a job, opens SSE, and returns formatted output', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/orchestrator/submit')) {
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 });
      }
      if (url.startsWith('/api/orchestrator/status')) {
        return new Response(
          JSON.stringify({ jobId: 'job-1', status: 'SUCCEEDED', exitCode: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    });

    // speed up polling loop
    vi.spyOn(globalThis, 'setTimeout');

    const { result } = renderHook(() => useJobRunner());

    let res;
    await act(async () => {
      res = await result.current.runCommand('echo hi', 'Test');
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/orchestrator/submit', expect.any(Object));
    expect(MockEventSource.instances[0]?.url).toContain('/api/orchestrator/events?jobId=job-1');

    expect(res).toBeDefined();
    // @ts-expect-error narrow in test
    expect(res.ok).toBe(true);
    // @ts-expect-error narrow in test
    expect(res.output).toContain('Job ID: job-1');
  });
});
