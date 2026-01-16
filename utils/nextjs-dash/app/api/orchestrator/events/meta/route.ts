import { NextRequest } from 'next/server';
import { okJson, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import type { ApiRouteContext } from '@/lib/routeWrapper';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { getActiveRunId } from '@/lib/scriptRunnerRunState';

/**
 * GET /api/orchestrator/events/meta
 * Lightweight endpoint used by the frontend to fetch a requestId for correlation
 * without opening an SSE stream (EventSource does not expose response headers).
 */
export const GET = withApiRoute({ name: 'ORCH_EVENTS_META_API' }, async function GET(request: NextRequest, ctx: ApiRouteContext) {
  const logger = createScopedServerLogger('ORCH_EVENTS_META_API');
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const runId = searchParams.get('runId');

  if (!jobId) {
    return errorJson(400, { error: 'jobId is required' }, { headers: { 'X-Request-Id': ctx.requestId } });
  }

  const active = runId ? getActiveRunId() : null;
  logger.debug('Events meta request received', { jobId, runId: runId ?? null, activeRunId: active });

  // Ignore stale meta requests from old reconnect loops.
  // runId is optional, but when provided we can protect against cross-run mixing.
  if (runId && active && runId !== active) {
    logger.debug('Rejecting stale events meta request', { jobId, runId, activeRunId: active });
    return errorJson(
      409,
      { error: 'stale_run', message: 'This events meta request is for a stale run.' },
      { headers: { 'X-Request-Id': ctx.requestId } }
    );
  }

  return okJson(
    { requestId: ctx.requestId, jobId, runId: runId ?? null },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': ctx.requestId,
      },
    }
  );
});

