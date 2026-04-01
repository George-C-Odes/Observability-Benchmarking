/**
 * Shared test fixtures for useJobRunner test suites.
 *
 * Provides mock implementations of EventSource, BroadcastChannel, and
 * sessionStorage used by the hook under test.
 */
import { vi } from 'vitest';
import { createMockStorage } from './storage';

// ---------------------------------------------------------------------------
// MockEventSource
// ---------------------------------------------------------------------------

export class MockEventSource {
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

  emitOpen(): void {
    this.onopen?.();
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }

  emitError(): void {
    this.onerror?.();
  }
}

// ---------------------------------------------------------------------------
// MockBroadcastChannel
// ---------------------------------------------------------------------------

/**
 * Minimal BroadcastChannel mock.
 *
 * Tests do not call methods directly — they satisfy the BroadcastChannel
 * API contract and are invoked indirectly by the SUT (`useJobRunner`) via
 * `globalThis.BroadcastChannel`.  The IDE cannot trace through the
 * `as unknown as typeof BroadcastChannel` cast, so it flags them as unused.
 *
 * noinspection JSUnusedGlobalSymbols — justified: called at runtime by SUT, not by test code.
 */
// noinspection JSUnusedGlobalSymbols
export class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>();

  private readonly name: string;
  private readonly listeners = new Set<(ev: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    const set = MockBroadcastChannel.channels.get(name) ?? new Set();
    set.add(this);
    MockBroadcastChannel.channels.set(name, set);
  }

  postMessage(data: unknown): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this) continue;
      for (const cb of peer.listeners) {
        cb(new MessageEvent('message', { data }));
      }
    }
  }

  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void {
    if (type === 'message') this.listeners.add(cb);
  }

  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void): void {
    if (type === 'message') this.listeners.delete(cb);
  }

  close(): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Common setup / teardown
// ---------------------------------------------------------------------------

/** Captured prior globals so we can restore them after tests. */
let savedEventSource: typeof globalThis.EventSource | undefined;
let savedBroadcastChannel: typeof globalThis.BroadcastChannel | undefined;
let savedSessionStorage: typeof globalThis.sessionStorage | undefined;

/**
 * Installs MockEventSource, MockBroadcastChannel, and a stub
 * sessionStorage on `globalThis`.  Call from `beforeEach`.
 *
 * Previous global values are preserved and restored by
 * {@link restoreMockGlobals}.
 */
export function installMockGlobals(): void {
  // Preserve current globals so they can be restored later.
  savedEventSource = globalThis.EventSource;
  savedBroadcastChannel = globalThis.BroadcastChannel;
  savedSessionStorage = globalThis.sessionStorage;

  // Reset static state that can leak across tests.
  MockEventSource.instances = [];
  MockBroadcastChannel.channels.clear();

  globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
  globalThis.sessionStorage = createMockStorage();
}

/**
 * Restores real timers, mocks, and the original globals that were
 * overwritten by {@link installMockGlobals}.  Call from `afterEach`.
 */
export function restoreMockGlobals(): void {
  vi.useRealTimers();
  vi.restoreAllMocks();

  // Clear static state accumulated during the test.
  MockEventSource.instances = [];
  MockBroadcastChannel.channels.clear();

  // Restore the prior global values captured during install.
  if (savedEventSource !== undefined) {
    globalThis.EventSource = savedEventSource;
  }
  if (savedBroadcastChannel !== undefined) {
    globalThis.BroadcastChannel = savedBroadcastChannel;
  }
  if (savedSessionStorage !== undefined) {
    globalThis.sessionStorage = savedSessionStorage;
  }

  savedEventSource = undefined;
  savedBroadcastChannel = undefined;
  savedSessionStorage = undefined;
}