import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/__tests__/_helpers/mockOrchestratorConfig';

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
    vi.restoreAllMocks();
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
