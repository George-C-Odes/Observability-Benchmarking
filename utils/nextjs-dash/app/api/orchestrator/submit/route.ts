import { NextRequest } from 'next/server';
import { submitCommand, validateCommand } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

/**
 * POST /api/orchestrator/submit
 * Submits a command to the orchestrator and returns the jobId immediately
 */
export const POST = withApiRoute({ name: 'ORCH_SUBMIT_API' }, async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { command?: unknown };
    serverLogger.info('Received command submission request');

    const { command } = body;
    const validatedCommand = validateCommand(command);

    serverLogger.info('Submitting command to orchestrator', { command: validatedCommand });

    const result = await submitCommand(validatedCommand);

    serverLogger.info('Job submitted', { jobId: result.jobId });

    return okJson({
      success: true,
      jobId: result.jobId,
    });
  } catch (error: unknown) {
    // Validation failures are 400s.
    if (error instanceof Error && /required/.test(error.message)) {
      return errorJson(400, { error: error.message });
    }

    serverLogger.error('Error submitting command:', error);
    return errorFromUnknown(500, error, 'Failed to submit command');
  }
});
