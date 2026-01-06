import { NextRequest, NextResponse } from 'next/server';

// Orchestrator service URL
const ORCHESTRATOR_URL = process.env.ORCH_URL || 'http://orchestrator:3002';
const ORCHESTRATOR_API_KEY = process.env.ORCH_API_KEY || 'dev-changeme';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(`[ORCHESTRATOR API] Received command execution request`);
    
    const { command } = body;

    if (!command || typeof command !== 'string') {
      console.error('[ORCHESTRATOR API] Missing or invalid command');
      return NextResponse.json(
        { error: 'Command is required and must be a string' },
        { status: 400 }
      );
    }

    console.log(`[ORCHESTRATOR API] Submitting command to orchestrator: ${command}`);

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

    console.log(`[ORCHESTRATOR API] Job submitted with ID: ${jobId}`);

    // Poll for job status
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`${ORCHESTRATOR_URL}/v1/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch job status: ${statusResponse.status}`);
      }

      const status = await statusResponse.json();
      console.log(`[ORCHESTRATOR API] Job ${jobId} status: ${status.state}`);

      if (status.state === 'COMPLETED' || status.state === 'FAILED') {
        return NextResponse.json({
          success: status.state === 'COMPLETED',
          output: status.output || status.error || 'No output available',
          jobId: jobId,
          state: status.state,
        });
      }

      attempts++;
    }

    // Timeout
    return NextResponse.json({
      success: false,
      output: 'Command execution timed out',
      jobId: jobId,
      state: 'TIMEOUT',
    }, { status: 408 });

  } catch (error: any) {
    console.error('[ORCHESTRATOR API] Error executing command:', error);
    
    return NextResponse.json(
      {
        error: 'Failed to execute command',
        details: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
