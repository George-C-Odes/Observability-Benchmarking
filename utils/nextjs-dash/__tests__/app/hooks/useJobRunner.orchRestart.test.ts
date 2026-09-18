import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useJobRunner } from '@/app/hooks/useJobRunner';
import {
  MockEventSource,
  installMockGlobals,
  restoreMockGlobals,
} from '@/__tests__/_helpers/useJobRunner.test-helpers';

vi.mock('@/app/hooks/useScriptRunnerConfig', () => ({
  useScriptRunnerConfig: () => ({
    config: {
      maxExecutionLogLines: 50,
      eventStreamTimeoutMs: 5_000,
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

describe('useJobRunner (orchestrator restart simulation)', () => {
  it.each([
    [404, 'not found', /no longer available/],
    [409, 'stale run', /rejected as stale run/],
    [422, 'invalid metadata', /validation failed/],
  ])(
    'marks the job as FAILED and stops reconnecting when events metadata returns %i',
    async (status, body, reason) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (input: RequestInfo | URL): Promise<Response> => {
          const url = String(input);

          if (url.endsWith('/api/orchestrator/submit')) {
            return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 });
          }

          if (url.startsWith('/api/orchestrator/events/meta')) {
            return new Response(body, { status });
          }

          return new Response('not found', { status: 404 });
        },
      );

      const { result } = renderHook(() => useJobRunner());

      await act(async () => {
        await result.current.runCommand('echo hi', 'Test');
      });

      expect(MockEventSource.instances.length).toBe(1);

      await act(async () => {
        // Trigger SSE error – hook should call events/meta and then terminate.
        MockEventSource.instances[0].emitError();
        await Promise.resolve();
      });

      // Should mark as FAILED.
      expect(result.current.lastJobStatus?.status).toBe('FAILED');

      // And it should not create new EventSource instances (no reconnect loop).
      expect(MockEventSource.instances.length).toBe(1);

      // Should log a helpful message.
      expect(result.current.lastJobStatus?.lastLine).toMatch(reason);
      expect(result.current.eventLogs.join('\n')).toContain(String(status));
    },
  );
});
