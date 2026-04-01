import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoggingConfig } from '@/app/hooks/useLoggingConfig';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';

describe('useLoggingConfig', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('starts with defaults', () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useLoggingConfig());
    expect(result.current.loading).toBe(true);
    expect(result.current.config).toEqual(DEFAULT_LOGGING_RUNTIME_CONFIG);
  });

  it('fetches and parses config', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          clientLogLevel: 'debug',
          serverLogLevel: 'error',
          serverLogOutput: 'json',
        }),
    });

    const { result } = renderHook(() => useLoggingConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config.clientLogLevel).toBe('debug');
    expect(result.current.config.serverLogLevel).toBe('error');
    expect(result.current.config.serverLogOutput).toBe('json');
  });

  it('falls back to defaults for missing fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useLoggingConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_LOGGING_RUNTIME_CONFIG);
  });

  it('sets error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useLoggingConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('Failed to load');
  });
});