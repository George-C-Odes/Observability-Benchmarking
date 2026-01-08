import { NextRequest } from 'next/server';
import { getJobStatus } from '@/lib/orchestratorClient';
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
    if (!jobId) {
      return errorJson(400, { error: 'jobId is required' });
    }

    serverLogger.info('Fetching status for job', { jobId });
    const status = await getJobStatus(jobId);

    serverLogger.info('Status received', { jobId, status: status.status });
    return okJson(status);
  } catch (error: unknown) {
    serverLogger.error('Error fetching job status:', error);
    return errorFromUnknown(500, error, 'Failed to fetch job status');
  }
});
