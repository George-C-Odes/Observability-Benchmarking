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
    // Touch handler members so TS/IDEs don't flag them as unused; the hook sets them.
    void this.onopen;
    void this.onmessage;
    void this.onerror;
    MockEventSource.instances.push(this);
  }

  emitError(): void {
    this.onerror?.();
  }
}

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

  // noinspection JSUnusedGlobalSymbols
  postMessage(data: unknown): void {
    void data;
    // No-op: this test focuses on the SSE error path.
  }

  // noinspection JSUnusedGlobalSymbols
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void {
    if (type === 'message') this.listeners.add(cb);
  }

  // noinspection JSUnusedGlobalSymbols
  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void): void {
    if (type === 'message') this.listeners.delete(cb);
  }

  // noinspection JSUnusedGlobalSymbols
  close(): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    this.listeners.clear();
  }
}

// noinspection JSUnusedGlobalSymbols
declare global {
  interface GlobalThis {
    EventSource: typeof EventSource;
    BroadcastChannel: typeof BroadcastChannel;
    sessionStorage: Storage;
  }
}

beforeEach(() => {
  // Reference the merged type so IDE inspections don't mark the augmentation as unused.
  void (globalThis as GlobalThis);

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useJobRunner (orchestrator restart simulation)', () => {
  it('marks job as FAILED and stops reconnecting when events meta returns 404 after SSE error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
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
      MockEventSource.instances[0].emitError();
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
