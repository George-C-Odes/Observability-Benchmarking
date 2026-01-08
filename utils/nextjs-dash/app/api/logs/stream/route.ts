import { NextRequest, NextResponse } from 'next/server';
import { getServerLogBuffer } from '@/lib/logBuffer';

export const runtime = 'nodejs';

/**
 * GET /api/logs/stream
 * Server-Sent Events stream of buffered Next.js server logs.
 *
 * Client can pass `sinceTs` to replay recent items.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sinceTsRaw = searchParams.get('sinceTs');
  const sinceTs = sinceTsRaw ? Number(sinceTsRaw) : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Initial replay
      const initial = getServerLogBuffer().snapshot({
        sinceTs: Number.isFinite(sinceTs) ? sinceTs : undefined,
      });
      for (const entry of initial) {
        send(entry);
      }

      // Keep-alive ping (proxies/load balancers)
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      // Poll-based follow (simple, reliable in Next.js)
      let lastTs = initial.length ? initial[initial.length - 1].ts : (Number.isFinite(sinceTs) ? (sinceTs as number) : 0);
      const follow = setInterval(() => {
        const newer = getServerLogBuffer().snapshot({ sinceTs: lastTs });
        if (newer.length) {
          lastTs = newer[newer.length - 1].ts;
          for (const entry of newer) {
            send(entry);
          }
        }
      }, 1000);

      const onAbort = () => {
        clearInterval(keepAlive);
        clearInterval(follow);
        controller.close();
      };

      request.signal.addEventListener('abort', onAbort);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
