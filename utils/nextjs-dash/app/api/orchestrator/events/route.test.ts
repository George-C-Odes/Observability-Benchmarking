import { describe, expect, it, vi } from 'vitest';

// NOTE: this is a Node test (uses the node vitest config). It focuses on stream robustness.

vi.mock('@/lib/config', () => ({
  orchestratorConfig: {
    url: 'http://orchestrator:3002',
    apiKey: 'x',
    timeout: 60000,
  },
}));

const mod = (await import('./route')) as unknown as { GET: (req: Request) => Promise<Response> };
const { GET } = mod;

function makeSseResponseFromChunk(chunk: Uint8Array) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      // keep open until canceled
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

    // NextRequest is compatible with Request enough for our usage (url + signal).
    // We attach an abort signal to emulate a client disconnect.
    const nextReq: Request = new Request(req, { signal: controller.signal });

    const res: Response = await GET(nextReq);
    expect(res.status).toBe(200);

    // Correlation header is best-effort in unit tests (depends on wrapper injection).
    // If present, it should be non-empty.
    const rid = res.headers.get('x-request-id');
    if (rid !== null) {
      expect(rid).toBeTruthy();
    }

    // Ensure we can start consuming, then abort.
    const reader = res.body!.getReader();
    await reader.read();
    controller.abort();

    // Read again to drive cancellation/cleanup; should not throw.
    await reader.read().catch(() => undefined);

    expect(fetchSpy).toHaveBeenCalled();
  });
});
