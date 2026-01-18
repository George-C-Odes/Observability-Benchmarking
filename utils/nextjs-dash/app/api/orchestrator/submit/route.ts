import { NextRequest } from 'next/server';
import { submitCommandWithRunId } from '@/lib/orchestratorClient';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { setActiveRunId } from '@/lib/scriptRunnerRunState';

/**
 * POST /api/orchestrator/submit
 * Submits a command to the orchestrator and returns the jobId immediately
 */
export const POST = withApiRoute({ name: 'ORCH_SUBMIT_API' }, async function POST(request: NextRequest, ctx) {
  const serverLogger = createScopedServerLogger('ORCH_SUBMIT_API');
  try {
    const body = (await request.json().catch(() => null)) as null | { command?: string; runId?: string };
    const command = body?.command;
    const runId = body?.runId;
    if (!command) {
      return errorJson(400, { error: 'command is required' });
    }

    serverLogger.debug('Submit request received', { hasRunId: Boolean(runId), runId: runId ?? null });

    if (runId) {
      setActiveRunId(runId);
      serverLogger.debug('Registered active script-runner run', { runId });
    }

    serverLogger.debug('Submitting command to orchestrator', { runId: runId ?? null });
    let result: { jobId: string; runId?: string | null };
    try {
      result = await submitCommandWithRunId(command, runId ?? null, ctx.requestId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      if (msg.includes('(503)')) {
        serverLogger.warn('Orchestrator is busy (503)', { runId: runId ?? null });
        return errorJson(503, { error: 'orchestrator_busy', message: 'Orchestrator is busy running another job. Try again shortly.' });
      }

      // Escalate as 502 since upstream rejected unexpectedly.
      serverLogger.error('Orchestrator submit failed unexpectedly', e);
      return errorJson(502, { error: 'orchestrator_submit_failed', message: msg || 'Orchestrator submit failed.' });
    }

    const jobId = result?.jobId;
    if (!jobId) {
      serverLogger.warn('Orchestrator submit returned no jobId', { result });
      return errorJson(502, { error: 'orchestrator_submit_failed', message: 'No jobId returned from orchestrator.' });
    }

    serverLogger.debug('Job submitted', { jobId, runId: runId ?? null, requestId: ctx.requestId });
    return okJson({ jobId, requestId: ctx.requestId });
  } catch (error: unknown) {
    serverLogger.error('Error submitting job', error);
    return errorFromUnknown(500, error, 'Failed to submit job');
  }
});
