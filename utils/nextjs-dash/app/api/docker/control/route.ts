import { NextRequest } from 'next/server';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { submitCommand } from '@/lib/orchestratorClient';
import { withApiRoute } from '@/lib/routeWrapper';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { buildDockerControlCommand, type DockerControlAction } from '@/lib/dockerComposeControl';

/**
 * POST /api/docker/control
 *
 * Minimal wrapper around orchestrator POST /v1/run for docker compose container control.
 * We intentionally don't poll job status here.
 */
export const POST = withApiRoute({ name: 'DOCKER_CONTROL_API' }, async function POST(request: NextRequest) {
  const serverLogger = createScopedServerLogger('DOCKER_CONTROL_API');
  try {
    const body = (await request.json()) as {
      service?: unknown;
      action?: unknown;
    };

    const service = body.service;
    const actionRaw = body.action;

    if (typeof service !== 'string' || !service.trim()) {
      return errorJson(400, { error: 'service must be a non-empty string' });
    }

    const isValidAction =
      actionRaw === 'start' ||
      actionRaw === 'stop' ||
      actionRaw === 'restart' ||
      actionRaw === 'recreate' ||
      actionRaw === 'delete';

    if (!isValidAction) {
      return errorJson(400, { error: 'action must be one of: start, stop, restart, recreate, delete' });
    }

    const action: DockerControlAction = actionRaw;

    // NOTE: service name is used as compose service and container name, per repo convention.
    // We submit explicit docker compose commands to orchestrator.
    const command = buildDockerControlCommand({
      service,
      action,
    });

    serverLogger.info('Submitting docker control command', {
      command,
      action,
      service,
    });

    const result = await submitCommand(command);

    return okJson({
      success: true,
      jobId: result.jobId,
      command,
    });
  } catch (error: unknown) {
    serverLogger.error('Error submitting docker control command', error);
    return errorFromUnknown(500, error, 'Failed to submit docker control command');
  }
});
