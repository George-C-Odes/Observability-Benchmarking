import { NextRequest } from 'next/server';
import { getJobStatusWithRunId } from '@/lib/orchestratorClient';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { getActiveRunId } from '@/lib/scriptRunnerRunState';

/**
 * GET /api/orchestrator/status
 * Polls job status by jobId from the orchestrator.
 *
 * NOTE: The Script Runner UI is currently SSE-only and does NOT call this endpoint.
 * Kept for future use (e.g., fallback when SSE isn't available) and for debugging.
 */
export const GET = withApiRoute({ name: 'ORCH_STATUS_API' }, async function GET(request: NextRequest) {
  const serverLogger = createScopedServerLogger('ORCH_STATUS_API');
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
      serverLogger.debug('Rejecting stale status polling request', { jobId, runId, activeRunId });
      return errorJson(409, { error: 'stale_run', message: 'This status polling request is for a stale run.' });
    }

    serverLogger.debug('Fetching status for job', { jobId, runId: runId ?? null, activeRunId: activeRunId ?? null });

    let status;
    try {
      status = await getJobStatusWithRunId(jobId, runId ?? null, request.headers.get('x-request-id'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      if (msg.includes('(409)')) {
        serverLogger.debug('Orchestrator rejected status as stale (409)', { jobId, runId: runId ?? null });
        return errorJson(409, { error: 'stale_run', message: 'This status request is for a stale run/job.' });
      }
      throw e;
    }

    serverLogger.debug('Status received', { jobId, status: status.status, runId: runId ?? null });
    return okJson(status);
  } catch (error: unknown) {
    serverLogger.error('Error fetching job status', error);
    return errorFromUnknown(500, error, 'Failed to fetch job status');
  }
});
