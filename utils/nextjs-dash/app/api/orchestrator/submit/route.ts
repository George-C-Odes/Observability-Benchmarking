import { NextRequest } from 'next/server';
import { submitCommand } from '@/lib/orchestratorClient';
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
    const command = body.command;
    if (typeof command !== 'string') {
      return errorJson(400, { error: 'command must be a string' });
    }

    serverLogger.info('Submitting command to orchestrator');
    const result = await submitCommand(command);

    serverLogger.info('Job submitted', { jobId: result.jobId });

    return okJson({
      success: true,
      jobId: result.jobId,
    });
  } catch (error: unknown) {
    serverLogger.error('Error submitting command:', error);
    return errorFromUnknown(500, error, 'Failed to submit command');
  }
});
