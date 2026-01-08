import { NextRequest, NextResponse } from 'next/server';
import { submitCommand, validateCommand } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';

/**
 * POST /api/orchestrator/submit
 * Submits a command to the orchestrator and returns the jobId immediately
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    serverLogger.info('[ORCHESTRATOR SUBMIT API] Received command submission request');

    const { command } = body;

    // Validate command
    const validatedCommand = validateCommand(command);

    serverLogger.info(`[ORCHESTRATOR SUBMIT API] Submitting command to orchestrator: ${validatedCommand}`);

    // Submit command using shared client
    const result = await submitCommand(validatedCommand);

    serverLogger.info(`[ORCHESTRATOR SUBMIT API] Job submitted with ID: ${result.jobId}`);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    serverLogger.error('[ORCHESTRATOR SUBMIT API] Error submitting command:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit command',
        details,
      },
      { status: 500 }
    );
  }
}
