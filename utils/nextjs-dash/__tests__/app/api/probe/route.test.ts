import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import '@/__tests__/_helpers/mockScopedServerLogger';

import { GET } from '@/app/api/probe/route';

describe('/api/probe route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PROBE_ALLOWED_URLS =
      'https://benchmark.example/hello,http://service.internal/health';
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
