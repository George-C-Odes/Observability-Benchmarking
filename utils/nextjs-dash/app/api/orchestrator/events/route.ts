import { NextRequest, NextResponse } from 'next/server';
import { orchestratorConfig } from '@/lib/config';
import { validateJobId } from '@/lib/orchestratorClient';

/**
 * GET /api/orchestrator/events
 * Streams job events from the orchestrator using Server-Sent Events (SSE)
 * This proxies the SSE stream from orchestrator to the browser
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  try {
    // Validate jobId for consistency
    const validatedJobId = validateJobId(jobId);
    
    console.log(`[ORCHESTRATOR EVENTS API] Starting SSE stream for job: ${validatedJobId}`);

    // Fetch the SSE stream from orchestrator
    const url = `${orchestratorConfig.url}/v1/jobs/${validatedJobId}/events`;
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

  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[ORCHESTRATOR EVENTS API] Error streaming events:', error);
    return NextResponse.json(
      {
        error: 'Failed to stream job events',
        details,
      },
      { status: 500 }
    );
  }
}
