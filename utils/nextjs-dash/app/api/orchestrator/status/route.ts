import { NextRequest, NextResponse } from 'next/server';

// Orchestrator service URL
const ORCHESTRATOR_URL = process.env.ORCH_URL || 'http://orchestrator:3002';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      );
    }

    console.log(`[ORCHESTRATOR STATUS API] Fetching status for job: ${jobId}`);

    const statusResponse = await fetch(`${ORCHESTRATOR_URL}/v1/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to fetch job status: ${statusResponse.status}`);
    }

    const responseJson = await statusResponse.json();
    console.log(`[ORCHESTRATOR STATUS API] Status for job: ${jobId} received: ${responseJson.status}`);
    return NextResponse.json(responseJson);

  } catch (error: any) {
    console.error('[ORCHESTRATOR STATUS API] Error fetching job status:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch job status',
        details: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
