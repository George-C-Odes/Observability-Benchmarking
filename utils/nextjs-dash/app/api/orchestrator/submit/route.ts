import { NextRequest, NextResponse } from 'next/server';

// Orchestrator service URL
const ORCHESTRATOR_URL = process.env.ORCH_URL || 'http://orchestrator:3002';
const ORCHESTRATOR_API_KEY = process.env.ORCH_API_KEY || 'dev-changeme';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(`[ORCHESTRATOR SUBMIT API] Received command submission request`);
    
    const { command } = body;

    if (!command || typeof command !== 'string') {
      console.error('[ORCHESTRATOR SUBMIT API] Missing or invalid command');
      return NextResponse.json(
        { error: 'Command is required and must be a string' },
        { status: 400 }
      );
    }

    console.log(`[ORCHESTRATOR SUBMIT API] Submitting command to orchestrator: ${command}`);

    // Submit command to orchestrator
    const runResponse = await fetch(`${ORCHESTRATOR_URL}/v1/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORCHESTRATOR_API_KEY}`,
      },
      body: JSON.stringify({ command }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      throw new Error(`Orchestrator returned ${runResponse.status}: ${errorText}`);
    }

    const runResult = await runResponse.json();
    const jobId = runResult.jobId;

    console.log(`[ORCHESTRATOR SUBMIT API] Job submitted with ID: ${jobId}`);

    // Return jobId immediately
    return NextResponse.json({
      success: true,
      jobId: jobId,
    });

  } catch (error: any) {
    console.error('[ORCHESTRATOR SUBMIT API] Error submitting command:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit command',
        details: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
