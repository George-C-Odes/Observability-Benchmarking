export type DockerControlAction = 'start' | 'stop' | 'restart' | 'recreate' | 'delete';

export interface DockerControlCommandParams {
  service: string;
  action: DockerControlAction;
}

/**
 * Some benchmark services run behind docker compose profiles (OBS + SERVICES).
 * This helper centralizes that profile selection so UI and API don't drift.
 */
export function needsServicesProfiles(serviceName: string): boolean {
  return serviceName.startsWith('spring-') ||
    serviceName.startsWith('quarkus-') ||
    serviceName.startsWith('spark-') ||
    serviceName.startsWith('javalin-') ||
    serviceName.startsWith('micronaut-') ||
    serviceName.startsWith('go');
}

export function composePrefixForService(serviceName: string): string {
  const base = 'docker compose';
  return needsServicesProfiles(serviceName) ? `${base} --profile=OBS --profile=SERVICES` : base;
}

/**
 * Build the docker compose command string for a control action.
 *
 * Contract:
 * - Pure function (no env access)
 * - Mirrors the semantics expected by /api/docker/control
 */
export function buildDockerControlCommand(params: DockerControlCommandParams): string {
  const { service, action } = params;
  const compose = composePrefixForService(service);

  if (action === 'start') {
    return `${compose} up -d ${service}`;
  }

  if (action === 'restart') {
    return `${compose} restart ${service}`;
  }

  if (action === 'recreate') {
    return `${compose} up -d --force-recreate ${service}`;
  }

  if (action === 'delete') {
    // `-s` == stop container if running
    return `${compose} rm -f -s ${service}`;
  }

  // stop
  return `${compose} stop ${service}`;
}
