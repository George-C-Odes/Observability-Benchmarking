import { NextRequest, NextResponse } from 'next/server';
import { orchestratorConfig } from '@/lib/config';
import { validateJobId } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

/**
 * GET /api/orchestrator/events
 * Streams job events from the orchestrator using Server-Sent Events (SSE)
 * This proxies the SSE stream from orchestrator to the browser
 */
export const GET = withApiRoute({ name: 'ORCH_EVENTS_API' }, async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  try {
    // Validate jobId for consistency
    const validatedJobId = validateJobId(jobId);

    serverLogger.info('Starting SSE stream for job', { jobId: validatedJobId });

    // Fetch the SSE stream from orchestrator
    const url = `${orchestratorConfig.url}/v1/jobs/${validatedJobId}/events`;
    const response = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      serverLogger.warn('Orchestrator SSE returned non-OK', { status: response.status, bodyText });
      return errorJson(response.status, {
        error: `Failed to connect to orchestrator events (${response.status})`,
        details: bodyText,
      });
    }

    // Create a new ReadableStream that proxies the orchestrator's stream
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (error) {
          serverLogger.error('Stream error:', error);
        } finally {
          controller.close();
        }
      },
    });

    // Return the stream with SSE headers
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && /jobId is required/.test(error.message)) {
      return errorJson(400, { error: error.message });
    }

    serverLogger.error('Error streaming events:', error);
    return errorFromUnknown(500, error, 'Failed to stream job events');
  }
});
