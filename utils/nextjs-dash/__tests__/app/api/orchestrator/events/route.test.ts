import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  orchestratorConfig: {
    url: 'http://orchestrator:3002',
    apiKey: 'x',
    timeout: 60000,
  },
}));

const mod = (await import('@/app/api/orchestrator/events/route')) as unknown as { GET: (req: Request) => Promise<Response> };
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
  it('does not throw when the client aborts while proxying upstream SSE', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(makeSseResponseFromChunk(new TextEncoder().encode('data: hi\n\n')));

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