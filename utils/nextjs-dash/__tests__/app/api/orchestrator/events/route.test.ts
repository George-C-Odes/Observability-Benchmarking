import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/__tests__/_helpers/mockOrchestratorConfig';
import { setActiveRunId } from '@/lib/scriptRunnerRunState';

const mod = (await import('@/app/api/orchestrator/events/route')) as unknown as {
  GET: (req: Request) => Promise<Response>;
};
const { GET } = mod;

function makeSseResponseFromChunk(chunk: Uint8Array) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('/api/orchestrator/events route', () => {
  afterEach(() => {
    setActiveRunId(null);
    vi.restoreAllMocks();
  });

  it('rejects missing jobs and stale runs before making an upstream request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const missing = await GET(new Request('http://localhost/api/orchestrator/events'));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: 'jobId is required' });
    setActiveRunId('current');
    const stale = await GET(
      new Request('http://localhost/api/orchestrator/events?jobId=job-1&runId=old'),
    );
    expect(stale.status).toBe(409);
    expect(stale.headers.get('x-request-id')).toBeTruthy();
    await expect(stale.json()).resolves.toMatchObject({ error: 'stale_run' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers preflight without opening an upstream stream', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await GET(
      new Request('http://localhost/api/orchestrator/events?jobId=job-1&preflight=1'),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.text()).resolves.toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves upstream chunks in order, correlation headers, and SSE buffering policy', async () => {
    const chunks = ['event: status\ndata: RUNNING\n\n', 'data: finished\n\n'];
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)));
        controller.close();
      },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(upstream));
    const res = await GET(
      new Request('http://localhost/api/orchestrator/events?jobId=job-1&runId=current', {
        headers: { 'X-Request-Id': 'test-stream' },
      }),
    );
    await expect(res.text()).resolves.toBe(': connected jobId=job-1\n\n' + chunks.join(''));
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://orchestrator:3002/v1/jobs/job-1/events?runId=current',
      {
        headers: {
          Accept: 'text/event-stream',
          Authorization: 'Bearer x',
          'X-Request-Id': 'test-stream',
        },
      },
    );
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('x-request-id')).toBe('test-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('closes cleanly when upstream has no body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null));
    const res = await GET(new Request('http://localhost/api/orchestrator/events?jobId=job-1'));
    await expect(res.text()).resolves.toBe(': connected jobId=job-1\n\n');
  });

  it('preserves upstream failure status and details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('job expired', { status: 404 }),
    );
    const res = await GET(new Request('http://localhost/api/orchestrator/events?jobId=job-1'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ jobId: 'job-1', details: 'job expired' });
  });

  it('returns a structured error when the upstream connection fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('connection refused'));
    const res = await GET(new Request('http://localhost/api/orchestrator/events?jobId=job-1'));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ error: 'Failed to stream job events' });
  });

  it('closes the client stream even when upstream cancellation rejects', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('Cancellation failed'));
    const upstream = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(upstream));
    const controller = new AbortController();
    const req = new Request('http://localhost/api/orchestrator/events?jobId=job-1', {
      signal: controller.signal,
    });

    const res = await GET(req);
    const body = res.text();
    controller.abort();

    await expect(body).resolves.toBe(': connected jobId=job-1\n\n');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('closes the client stream when an upstream read and final cancellation reject', async () => {
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Upstream failed'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(upstream));

    const res = await GET(new Request('http://localhost/api/orchestrator/events?jobId=job-1'));

    await expect(res.text()).resolves.toBe(': connected jobId=job-1\n\n');
  });

  it('does not throw when the client aborts while proxying upstream SSE', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      makeSseResponseFromChunk(new TextEncoder().encode('data: hi\n\n')),
    );

    const req = new Request('http://localhost/api/orchestrator/events?jobId=job-1');
    const controller = new AbortController();

    const nextReq: Request = new Request(req, { signal: controller.signal });

    const res: Response = await GET(nextReq);
    expect(res.status).toBe(200);

    const rid = res.headers.get('x-request-id');
    if (rid !== null) {
      expect(rid).toBeTruthy();
    }

    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();

    await reader.read().catch(() => undefined);

    expect(fetchSpy).toHaveBeenCalled();
  });
});
