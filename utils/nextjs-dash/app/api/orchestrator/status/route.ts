import { NextRequest } from 'next/server';
import { getJobStatus, validateJobId } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

/**
 * GET /api/orchestrator/status
 * Polls job status by jobId from the orchestrator
 */
export const GET = withApiRoute({ name: 'ORCH_STATUS_API' }, async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    // Validate jobId
    const validatedJobId = validateJobId(jobId);

    serverLogger.info('Fetching status for job', { jobId: validatedJobId });

    // Get status using shared client
    const status = await getJobStatus(validatedJobId);

    serverLogger.info('Status received', { jobId: validatedJobId, status: status.status });
    return okJson(status);
  } catch (error: unknown) {
    if (error instanceof Error && /jobId is required/.test(error.message)) {
      return errorJson(400, { error: error.message });
    }

    serverLogger.error('Error fetching job status:', error);
    return errorFromUnknown(500, error, 'Failed to fetch job status');
  }
});
