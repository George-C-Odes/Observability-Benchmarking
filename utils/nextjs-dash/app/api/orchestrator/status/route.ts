import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus, validateJobId } from '@/lib/orchestratorClient';

/**
 * GET /api/orchestrator/status
 * Polls job status by jobId from the orchestrator
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // Validate jobId
    const validatedJobId = validateJobId(jobId);

    console.log(`[ORCHESTRATOR STATUS API] Fetching status for job: ${validatedJobId}`);

    // Get status using shared client
    const status = await getJobStatus(validatedJobId);
    
    console.log(`[ORCHESTRATOR STATUS API] Status for job: ${validatedJobId} received: ${status.status}`);
    return NextResponse.json(status);

  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error('[ORCHESTRATOR STATUS API] Error fetching job status:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch job status',
        details,
      },
      { status: 500 }
    );
  }
}
