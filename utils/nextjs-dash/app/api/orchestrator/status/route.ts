import { NextRequest } from 'next/server';
import { getJobStatusWithRunId } from '@/lib/orchestratorClient';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { getActiveRunId } from '@/lib/scriptRunnerRunState';

/**
 * GET /api/orchestrator/status
 * Polls job status by jobId from the orchestrator
 */
export const GET = withApiRoute({ name: 'ORCH_STATUS_API' }, async function GET(request: NextRequest) {
  const logger = createScopedServerLogger('ORCH_STATUS_API');
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) {
      return errorJson(400, { error: 'jobId is required' });
    }

    const runId = searchParams.get('runId');
    const activeRunId = getActiveRunId();

    // If caller supplies runId, it must match the active run (single-run-at-a-time UI contract).
    if (runId && activeRunId && runId !== activeRunId) {
      logger.debug('Rejecting stale status polling request', { jobId, runId, activeRunId });
      return errorJson(409, { error: 'stale_run', message: 'This status polling request is for a stale run.' });
    }

    logger.debug('Fetching status for job', { jobId, runId: runId ?? null, activeRunId: activeRunId ?? null });

    let status;
    try {
      status = await getJobStatusWithRunId(jobId, runId ?? null, request.headers.get('x-request-id'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      if (msg.includes('(409)')) {
        logger.debug('Orchestrator rejected status as stale (409)', { jobId, runId: runId ?? null });
        return errorJson(409, { error: 'stale_run', message: 'This status request is for a stale run/job.' });
      }
      throw e;
    }

    logger.debug('Status received', { jobId, status: status.status, runId: runId ?? null });
    return okJson(status);
  } catch (error: unknown) {
    logger.error('Error fetching job status', error);
    return errorFromUnknown(500, error, 'Failed to fetch job status');
  }
});
