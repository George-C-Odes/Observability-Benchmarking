import { NextRequest } from 'next/server';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { submitCommand } from '@/lib/orchestratorClient';
import { withApiRoute } from '@/lib/routeWrapper';
import { serverLogger } from '@/lib/serverLogger';

function needsServicesProfiles(serviceName: string): boolean {
  return serviceName.startsWith('spring-') || serviceName.startsWith('quarkus-') || serviceName.startsWith('go');
}

function composePrefixForService(serviceName: string): string {
  const base = 'docker compose';
  // Spring/Quarkus/Go services are behind compose profiles.
  return needsServicesProfiles(serviceName) ? `${base} --profile=OBS --profile=SERVICES` : base;
}

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

    const forceRecreate = body.forceRecreate === true;
    const deleteContainer = body.deleteContainer === true;

    // NOTE: service name is used as compose service and container name, per repo convention.
    // We submit *explicit docker compose commands* to orchestrator and do not send any higher-level intent.
    const compose = composePrefixForService(service);
    let command: string;
    if (action === 'start') {
      command = `${compose} up -d${forceRecreate ? ' --force-recreate' : ''} ${service}`;
    } else if (action === 'restart') {
      command = forceRecreate
        ? `${compose} up -d --force-recreate ${service}`
        : `${compose} restart ${service}`;
    } else {
      // stop
      command = `${compose} stop ${service}`;
      if (deleteContainer) {
        // Use a single rm command that also stops if running.
        command = `${compose} rm -f -s ${service}`;
      }
    }

    serverLogger.info('[DOCKER CONTROL API] Submitting docker control command', {
      command,
      action,
      service,
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
