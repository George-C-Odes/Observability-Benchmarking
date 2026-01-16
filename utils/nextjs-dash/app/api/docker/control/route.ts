import { NextRequest } from 'next/server';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { submitCommand } from '@/lib/orchestratorClient';
import { withApiRoute } from '@/lib/routeWrapper';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import {
  buildDockerControlCommand,
  type DockerRestartMode,
  type DockerStartMode,
  type DockerStopMode,
} from '@/lib/dockerComposeControl';

/**
 * POST /api/docker/control
 *
 * Minimal wrapper around orchestrator POST /v1/run for docker compose container control.
 * We intentionally don't poll job status here.
 */
export const POST = withApiRoute({ name: 'DOCKER_CONTROL_API' }, async function POST(request: NextRequest) {
  const logger = createScopedServerLogger('DOCKER_CONTROL_API');
  try {
    const body = (await request.json()) as {
      service?: unknown;
      action?: unknown;

      // Explicit intent.
      startMode?: unknown;
      restartMode?: unknown;
      stopMode?: unknown;
    };

    const service = body.service;
    const action = body.action;

    if (typeof service !== 'string' || !service.trim()) {
      return errorJson(400, { error: 'service must be a non-empty string' });
    }
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return errorJson(400, { error: 'action must be one of: start, stop, restart' });
    }

    const startMode: DockerStartMode | undefined =
      body.startMode === 'start' || body.startMode === 'recreate' ? body.startMode : undefined;
    const restartMode: DockerRestartMode | undefined =
      body.restartMode === 'restart' || body.restartMode === 'recreate' ? body.restartMode : undefined;
    const stopMode: DockerStopMode | undefined =
      body.stopMode === 'stop' || body.stopMode === 'delete' ? body.stopMode : undefined;

    // NOTE: service name is used as compose service and container name, per repo convention.
    // We submit *explicit docker compose commands* to orchestrator and do not send any higher-level intent.
    const command = buildDockerControlCommand({
      service,
      action,
      startMode,
      restartMode,
      stopMode,
    });

    logger.info('Submitting docker control command', {
      command,
      action,
      service,
      startMode,
      restartMode,
      stopMode,
    });

    const result = await submitCommand(command);

    return okJson({
      success: true,
      jobId: result.jobId,
      command,
    });
  } catch (error: unknown) {
    logger.error('Error submitting docker control command', error);
    return errorFromUnknown(500, error, 'Failed to submit docker control command');
  }
});
