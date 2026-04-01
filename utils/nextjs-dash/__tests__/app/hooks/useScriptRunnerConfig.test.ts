import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useScriptRunnerConfig } from '@/app/hooks/useScriptRunnerConfig';
import { DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';

describe('useScriptRunnerConfig', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('starts with defaults', () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useScriptRunnerConfig());
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toEqual(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG);
  });

  it('fetches and parses config', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          maxExecutionLogLines: 999,
          eventStreamTimeoutMs: 60000,
          debug: true,
        }),
    });

    const { result } = renderHook(() => useScriptRunnerConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config.maxExecutionLogLines).toBe(999);
    expect(result.current.config.eventStreamTimeoutMs).toBe(60000);
    expect(result.current.config.debug).toBe(true);
  });

  it('falls back to defaults for missing fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useScriptRunnerConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG);
  });

  it('sets error on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('unavailable'),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useScriptRunnerConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('Failed to load');
  });
});