import { NextRequest, NextResponse } from 'next/server';
import { submitCommand, getJobStatus, validateCommand } from '@/lib/orchestratorClient';

/**
 * POST /api/orchestrator
 * Legacy endpoint for backward compatibility
 * Submits command and polls for completion (blocking)
 * 
 * @deprecated Use /api/orchestrator/submit and /api/orchestrator/status instead
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(`[ORCHESTRATOR API] Received command execution request (legacy endpoint)`);
    
    const { command } = body;

    // Validate command
    const validatedCommand = validateCommand(command);

    console.log(`[ORCHESTRATOR API] Submitting command to orchestrator: ${validatedCommand}`);

    // Submit command using shared client
    const runResult = await submitCommand(validatedCommand);
    const jobId = runResult.jobId;

    console.log(`[ORCHESTRATOR API] Job submitted with ID: ${jobId}`);

    // Poll for job status (blocking behavior for backward compatibility)
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const responseJson = await getJobStatus(jobId);
      const responseStatus = responseJson.status;
      console.log(`[ORCHESTRATOR API] Job ${jobId} status: ${responseStatus}`);

      if (responseStatus === 'SUCCEEDED' || responseStatus === 'FAILED' || responseStatus === 'CANCELED') {
        return NextResponse.json({
          success: responseStatus === 'SUCCEEDED',
          output: responseJson.output || responseJson.error || 'No output available',
          jobId: jobId,
          state: responseStatus,
          jobDetails: {
            jobId: responseJson.jobId,
            status: responseStatus,
            createdAt: responseJson.createdAt,
            startedAt: responseJson.startedAt,
            finishedAt: responseJson.finishedAt,
            exitCode: responseJson.exitCode,
            lastLine: responseJson.lastLine,
          },
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