import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useJobRunner } from './useJobRunner';

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

class MockEventSource {
  static instances: MockEventSource[] = [];
  // The hook assigns these handlers at runtime.
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

// Touch the members once so IDE/typecheck doesn't flag them as unused in this test-only file.
// (Intentionally omitted; we rely on documented eslint-disable comments instead.)

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();
  private readonly name: string;
  private readonly listeners = new Set<(ev: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    const set = MockBroadcastChannel.channels.get(name) ?? new Set();
    set.add(this);
    MockBroadcastChannel.channels.set(name, set);
  }

  postMessage() {
    // No-op: this test focuses on SSE error path.
  }

  addEventListener(type: 'message', cb: (ev: MessageEvent) => void) {
    if (type === 'message') this.listeners.add(cb);
  }

  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void) {
    if (type === 'message') this.listeners.delete(cb);
  }

  close() {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    this.listeners.clear();
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

  const store = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;

  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useJobRunner (orchestrator restart simulation)', () => {
  it('marks job as FAILED and stops reconnecting when events meta returns 404 after SSE error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/api/orchestrator/submit')) {
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 });
      }

      if (url.startsWith('/api/orchestrator/events/meta')) {
        return new Response('not found', { status: 404 });
      }

      return new Response('not found', { status: 404 });
    });

    const { result } = renderHook(() => useJobRunner());

    await act(async () => {
      await result.current.runCommand('echo hi', 'Test');
    });

    expect(MockEventSource.instances.length).toBe(1);

    await act(async () => {
      // Trigger SSE error – hook should call events/meta and then terminate.
      MockEventSource.instances[0].onerror?.();
      await Promise.resolve();
    });

    // Should mark as FAILED.
    expect(result.current.lastJobStatus?.status).toBe('FAILED');

    // And it should not create new EventSource instances (no reconnect loop).
    expect(MockEventSource.instances.length).toBe(1);

    // Should log a helpful message.
    expect(result.current.eventLogs.join('\n')).toMatch(/404/);
  });
});
