import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useServiceActionsConfig } from '@/app/hooks/useServiceActionsConfig';
import { DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';

describe('useServiceActionsConfig', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads service action flags from the runtime endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ enabled: { grafana: true, go: false } }),
    });
    globalThis.fetch = fetchMock;

    const { result } = renderHook(() => useServiceActionsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith('/api/service-actions/config', { cache: 'no-store' });
    expect(result.current.config.enabled).toEqual({ grafana: true, go: false });
    expect(result.current.error).toBeNull();
  });

  it('uses the shared defaults when the response omits enabled flags', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useServiceActionsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG);
  });
});
