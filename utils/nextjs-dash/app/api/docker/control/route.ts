import { NextRequest } from 'next/server';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { submitCommand } from '@/lib/orchestratorClient';
import { withApiRoute } from '@/lib/routeWrapper';
import { serverLogger } from '@/lib/serverLogger';
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
  try {
    const body = (await request.json()) as {
      service?: unknown;
      action?: unknown;

      // Preferred explicit intent.
      startMode?: unknown;
      restartMode?: unknown;
      stopMode?: unknown;

      // Legacy flags (back-compat).
      forceRecreate?: unknown;
      deleteContainer?: unknown;
    };

    const service = body.service;
    const action = body.action;

    if (typeof service !== 'string' || !service.trim()) {
      return errorJson(400, { error: 'service must be a non-empty string' });
    }
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      return errorJson(400, { error: 'action must be one of: start, stop, restart' });
    }

    const startMode: DockerStartMode | undefined = body.startMode === 'start' || body.startMode === 'recreate' ? body.startMode : undefined;
    const restartMode: DockerRestartMode | undefined =
      body.restartMode === 'restart' || body.restartMode === 'recreate' ? body.restartMode : undefined;
    const stopMode: DockerStopMode | undefined = body.stopMode === 'stop' || body.stopMode === 'delete' ? body.stopMode : undefined;

    const forceRecreate = body.forceRecreate === true;
    const deleteContainer = body.deleteContainer === true;

    // NOTE: service name is used as compose service and container name, per repo convention.
    // We submit *explicit docker compose commands* to orchestrator and do not send any higher-level intent.
    const command = buildDockerControlCommand({
      service,
      action,
      startMode,
      restartMode,
      stopMode,

      // Back-compat mapping is handled inside buildDockerControlCommand.
      forceRecreate,
      deleteContainer,
    });

    serverLogger.info('[DOCKER CONTROL API] Submitting docker control command', {
      command,
      action,
      service,
      startMode,
      restartMode,
      stopMode,
      forceRecreate,
      deleteContainer,
    });

    const result = await submitCommand(command);

    return okJson({
      success: true,
      jobId: result.jobId,
      command,
    });
  } catch (error: unknown) {
    serverLogger.error('[DOCKER CONTROL API] Error:', error);
    return errorFromUnknown(500, error, 'Failed to submit docker control command');
  }
});
