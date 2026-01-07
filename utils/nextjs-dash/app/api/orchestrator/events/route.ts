import { NextRequest, NextResponse } from 'next/server';
import { orchestratorConfig } from '@/lib/config';

/**
 * GET /api/orchestrator/events
 * Streams job events from the orchestrator using Server-Sent Events (SSE)
 * This proxies the SSE stream from orchestrator to the browser
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId parameter is required' },
      { status: 400 }
    );
  }

  console.log(`[ORCHESTRATOR EVENTS API] Starting SSE stream for job: ${jobId}`);

  try {
    // Fetch the SSE stream from orchestrator
    const url = `${orchestratorConfig.url}/v1/jobs/${jobId}/events`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to orchestrator events: ${response.status}`);
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
          console.error('[ORCHESTRATOR EVENTS API] Stream error:', error);
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
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('[ORCHESTRATOR EVENTS API] Error streaming events:', error);
    return NextResponse.json(
      {
        error: 'Failed to stream job events',
        details: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
