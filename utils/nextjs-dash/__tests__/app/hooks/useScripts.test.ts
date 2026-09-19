import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useScripts } from '@/app/hooks/useScripts';
import { silenceConsole } from '@/__tests__/_helpers/consoleSpy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScripts', () => {
  it('loads scripts from /api/scripts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          scripts: [{ name: 'A', description: 'd', command: 'c', category: 'test' }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
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

  it('reports an API failure and leaves the scripts list empty', async () => {
    silenceConsole();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('backend unavailable', { status: 503 }),
    );

    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Failed to load scripts');
    expect(result.current.scripts).toEqual([]);
  });

  it('refreshes scripts and clears a prior error', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ scripts: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            scripts: [{ name: 'B', description: 'new', command: 'run-b', category: 'test' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.scripts.map((script) => script.name)).toEqual(['B']);
  });
});
