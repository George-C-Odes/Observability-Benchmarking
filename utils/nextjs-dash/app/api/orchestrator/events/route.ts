import { NextRequest, NextResponse } from 'next/server';
import { orchestratorConfig } from '@/lib/config';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import type { ApiRouteContext } from '@/lib/routeWrapper';
import { getActiveRunId } from '@/lib/scriptRunnerRunState';

/**
 * GET /api/orchestrator/events
 * Streams job events from the orchestrator using Server-Sent Events (SSE)
 * This proxies the SSE stream from orchestrator to the browser
 */
export const GET = withApiRoute({ name: 'ORCH_EVENTS_API' }, async function GET(request: NextRequest, ctx: ApiRouteContext) {
  const logger = createScopedServerLogger('ORCH_EVENTS_API');
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const preflight = searchParams.get('preflight');
  const runId = searchParams.get('runId');
  const requestId = ctx.requestId;

  try {
    if (!jobId) {
      return errorJson(400, { error: 'jobId is required' }, requestId ? { headers: { 'X-Request-Id': requestId } } : undefined);
    }

    const activeRunId = getActiveRunId();
    if (runId && activeRunId && runId !== activeRunId) {
      logger.debug('Rejecting stale SSE stream request', { jobId, runId, activeRunId });
      return errorJson(409, { error: 'stale_run', message: 'This SSE stream request is for a stale run.' }, requestId ? { headers: { 'X-Request-Id': requestId } } : undefined);
    }

    logger.debug('SSE request received', { jobId, runId: runId ?? null, preflight: Boolean(preflight), activeRunId: activeRunId ?? null });

    if (preflight) {
      return new NextResponse('', {
        status: 204,
        headers: {
          'Cache-Control': 'no-store',
          ...(requestId ? { 'X-Request-Id': requestId } : {}),
        },
      });
    }

    const url = `${orchestratorConfig.url}/v1/jobs/${jobId}/events${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
        ...(orchestratorConfig.apiKey ? { Authorization: `Bearer ${orchestratorConfig.apiKey}` } : {}),
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      logger.warn('Orchestrator SSE returned non-OK', { status: response.status, bodyText, jobId });
      return errorJson(
        response.status,
        {
          error: `Failed to connect to orchestrator events (${response.status})`,
          jobId,
          details: bodyText,
        },
        requestId ? { headers: { 'X-Request-Id': requestId } } : undefined
      );
    }

    // Create a new ReadableStream that proxies the orchestrator's stream.
    // Important: handle client aborts; otherwise, the controller may be closed while we're still enqueuing.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // Send an initial SSE comment to:
        // 1) verify the connection works immediately
        // 2) discourage intermediate buffering
        // 3) help clients detect we are connected
        try {
          controller.enqueue(new TextEncoder().encode(`: connected jobId=${jobId}\n\n`));
        } catch {
          // ignore
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let closed = false;
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        };

        const onAbort = () => {
          logger.info('SSE client disconnected; canceling upstream reader', { jobId });
          try {
            void reader.cancel();
          } catch {
            // ignore
          }
          safeClose();
        };

        request.signal.addEventListener('abort', onAbort);

        try {
          while (true) {
            // Stop ASAP if the client is gone.
            if (request.signal.aborted || closed) {
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            try {
              controller.enqueue(value);
            } catch (error) {
              // This is typically "Controller is already closed" when the client disconnects.
              logger.debug('SSE enqueue failed; closing stream', { jobId, error });
              break;
            }
          }
        } catch (error) {
          // Don't surface abort as an error.
          if (!request.signal.aborted) {
            logger.error('Stream error', error);
          }
        } finally {
          request.signal.removeEventListener('abort', onAbort);
          try {
            void reader.cancel();
          } catch {
            // ignore
          }
          safeClose();
        }
      },
    });

    // Return the stream with SSE headers
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
    });
  } catch (error: unknown) {
    logger.error('Error streaming events', error);
    return errorFromUnknown(500, error, 'Failed to stream job events');
  }
});
