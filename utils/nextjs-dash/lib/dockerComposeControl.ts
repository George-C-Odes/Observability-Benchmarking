export type DockerControlAction = 'start' | 'stop' | 'restart';

export type DockerStartMode = 'start' | 'recreate';
export type DockerRestartMode = 'restart' | 'recreate';
export type DockerStopMode = 'stop' | 'delete';

export interface DockerControlCommandParams {
  service: string;
  action: DockerControlAction;

  /**
   * Explicit intent for start.
   * - start: `docker compose up -d SERVICE`
   * - recreate: `docker compose up -d --force-recreate SERVICE`
   */
  startMode?: DockerStartMode;

  /**
   * Explicit intent for restart.
   * - restart: `docker compose restart SERVICE`
   * - recreate: `docker compose up -d --force-recreate SERVICE`
   */
  restartMode?: DockerRestartMode;

  /**
   * Explicit intent for stop.
   * - stop: `docker compose stop SERVICE`
   * - delete: `docker compose rm -f -s SERVICE` (stop if running)
   */
  stopMode?: DockerStopMode;
}

/**
 * Some benchmark services run behind docker compose profiles (OBS + SERVICES).
 * This helper centralizes that profile selection so UI and API don't drift.
 */
export function needsServicesProfiles(serviceName: string): boolean {
  return serviceName.startsWith('spring-') || serviceName.startsWith('quarkus-') || serviceName.startsWith('go');
}

export function composePrefixForService(serviceName: string): string {
  const base = 'docker compose';
  return needsServicesProfiles(serviceName) ? `${base} --profile=OBS --profile=SERVICES` : base;
}

function normalizeIntent(params: DockerControlCommandParams): {
  startMode: DockerStartMode;
  restartMode: DockerRestartMode;
  stopMode: DockerStopMode;
} {
  return {
    startMode: params.startMode ?? 'start',
    restartMode: params.restartMode ?? 'restart',
    stopMode: params.stopMode ?? 'stop',
  };
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

  const { startMode, restartMode, stopMode } = normalizeIntent(params);

  if (action === 'start') {
    return startMode === 'recreate'
      ? `${compose} up -d --force-recreate ${service}`
      : `${compose} up -d ${service}`;
  }

  if (action === 'restart') {
    return restartMode === 'recreate'
      ? `${compose} up -d --force-recreate ${service}`
      : `${compose} restart ${service}`;
  }

  // stop
  if (stopMode === 'delete') {
    // `-s` == stop container if running
    return `${compose} rm -f -s ${service}`;
  }
  return `${compose} stop ${service}`;
}
