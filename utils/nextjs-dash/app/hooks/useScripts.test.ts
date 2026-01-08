import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useScripts } from './useScripts';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_ORCH_URL', '');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScripts', () => {
  it('loads scripts from /api/scripts', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ scripts: [{ name: 'A', description: 'd', command: 'c', category: 'test' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response
      );

    const { result } = renderHook(() => useScripts());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/scripts');
    expect(result.current.error).toBe(null);
    expect(result.current.scripts).toHaveLength(1);
    expect(result.current.scripts[0].name).toBe('A');
  });
});

