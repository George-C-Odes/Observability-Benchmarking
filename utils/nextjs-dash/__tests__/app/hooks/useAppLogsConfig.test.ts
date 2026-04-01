import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppLogsConfig } from '@/app/hooks/useAppLogsConfig';
import { DEFAULT_APP_LOGS_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';

describe('useAppLogsConfig', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('starts with defaults and loading=true', () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useAppLogsConfig());
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toEqual(DEFAULT_APP_LOGS_RUNTIME_CONFIG);
    expect(result.current.error).toBeNull();
  });

  it('fetches config and returns parsed values', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ clientMaxEntries: 111, serverMaxEntries: 222 }),
    });

    const { result } = renderHook(() => useAppLogsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config.clientMaxEntries).toBe(111);
    expect(result.current.config.serverMaxEntries).toBe(222);
    expect(result.current.error).toBeNull();
  });

  it('falls back to defaults for missing fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useAppLogsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_APP_LOGS_RUNTIME_CONFIG);
  });

  it('sets error on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('server error'),
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAppLogsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('Failed to load');
    expect(result.current.config).toEqual(DEFAULT_APP_LOGS_RUNTIME_CONFIG);
  });

  it('sets error on fetch exception', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAppLogsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('Failed to load');
  });
});