import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { useScripts } from '@/app/hooks/useScripts';
import { silenceConsole } from '@/__tests__/_helpers/consoleSpy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScripts', () => {
  it('uses an empty list for a response without scripts and handles a failed refresh', async () => {
    silenceConsole();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const { result } = renderHook(() => useScripts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scripts).toEqual([]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Failed to load scripts');
  });

  it.each([true, false])(
    'ignores a stale initial load after effect restart (success=%s)',
    async (success) => {
      const errorSpy = silenceConsole().error;
      let finish!: (response: Response) => void;
      let fail!: (reason: Error) => void;
      const freshScripts = [
        { name: 'fresh', description: 'current', command: 'run', category: 'test' },
      ];
      vi.spyOn(globalThis, 'fetch')
        .mockReturnValueOnce(
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ scripts: freshScripts })));
      const { result } = renderHook(() => useScripts(), { wrapper: StrictMode });
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        if (success) finish(new Response('{}'));
        else fail(new Error('late failure'));
      });
      expect(result.current.scripts).toEqual(freshScripts);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );
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
      .mockResolvedValueOnce(new Response('backend unavailable', { status: 503 }))
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
