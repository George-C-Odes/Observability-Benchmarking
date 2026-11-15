import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/__tests__/_helpers/mockScopedServerLogger';

import { GET } from '@/app/api/probe/route';

describe('/api/probe route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv(
      'PROBE_ALLOWED_URLS',
      'https://benchmark.example/hello,http://service.internal/health',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  function request(target?: string, timeout?: string) {
    const params = new URLSearchParams();
    if (target !== undefined) params.set('url', target);
    if (timeout !== undefined) params.set('timeoutMs', timeout);
    return new NextRequest(`http://localhost/api/probe?${params}`);
  }

  it.each([
    [undefined, 400],
    ['not a URL', 400],
    ['file:///etc/passwd', 400],
    ['https://user:secret@benchmark.example/hello', 403],
    ['https://:secret@benchmark.example/hello', 403],
    ['https://benchmark.example/hello?admin=true', 403],
    ['https://benchmark.example/%2e%2e/admin', 403],
  ])('rejects invalid or unauthorized target %s without fetching', async (target, status) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect((await GET(request(target))).status).toBe(status);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed when the allowlist is absent', async () => {
    vi.stubEnv('PROBE_ALLOWED_URLS', undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect((await GET(request('https://benchmark.example/hello'))).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores malformed allowlist entries and normalizes fragments', async () => {
    vi.stubEnv(
      'PROBE_ALLOWED_URLS',
      'invalid,ftp://benchmark.example/hello, https://benchmark.example/hello#configured',
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const res = await GET(request('https://benchmark.example/hello#requested'));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://benchmark.example/hello',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('uses a bounded GET for servers that return 501 to HEAD', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 501 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const res = await GET(request('https://benchmark.example/hello'));
    expect(await res.json()).toEqual({ ok: false, status: 503, durationMs: expect.any(Number) });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://benchmark.example/hello',
      expect.objectContaining({
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'error',
      }),
    );
  });

  it.each([new DOMException('timeout', 'AbortError'), new Error('request aborted')])(
    'reports aborted probes as timeouts',
    async (error) => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
      const res = await GET(request('https://benchmark.example/hello'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: false,
        status: 0,
        timedOut: true,
        durationMs: expect.any(Number),
      });
      expect(res.headers.get('cache-control')).toBe('no-store');
    },
  );

  it.each([new Error('connection refused'), null, { name: 42 }, 'network failure'])(
    'returns 500 for non-abort failures (%s)',
    async (error) => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
      const res = await GET(request('https://benchmark.example/hello'));
      expect(res.status).toBe(500);
      expect(await res.json()).toHaveProperty('error');
    },
  );

  it.each([
    ['5', 5],
    ['NaN', 2000],
  ])('aborts after the configured or default timeout (%s)', async (timeout, delay) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timeout', 'AbortError')),
          );
        }),
    );
    const pending = GET(request('https://benchmark.example/hello', timeout));
    const completed = vi.fn();
    void pending.then(completed);
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(await res.json()).toMatchObject({ timedOut: true, status: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('probes an explicitly allowed URL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const response = await GET(
      new NextRequest('http://localhost/api/probe?url=https%3A%2F%2Fbenchmark.example%2Fhello'),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://benchmark.example/hello',
      expect.objectContaining({ method: 'HEAD', redirect: 'error' }),
    );
  });

  it('rejects URLs that are not explicitly allowed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      new NextRequest('http://localhost/api/probe?url=https%3A%2F%2F169.254.169.254%2Flatest'),
    );

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unconfigured URL on an otherwise configured host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      new NextRequest('http://localhost/api/probe?url=https%3A%2F%2Fbenchmark.example%2Fadmin'),
    );

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to GET when HEAD is unsupported', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await GET(
      new NextRequest('http://localhost/api/probe?url=http%3A%2F%2Fservice.internal%2Fhealth'),
    );

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://service.internal/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
