export type ServiceActionFlags = {
  start: boolean;
  restart: boolean;
  stop: boolean;
  recreate: boolean;
  delete: boolean;
};

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'n') return false;
  return fallback;
}

function isObsCoreDefaultEnabled(serviceName: string): boolean {
  return ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(serviceName);
}

/**
 * Contract:
 * - There is a single enable/disable flag per service.
 * - If enabled: all actions are enabled together (start/restart/stop/recreate/delete),
 *   except that UI may still hide actions based on health state (e.g. DOWN -> only Start).
 * - If disabled: all 5 actions are disabled together.
 * - Defaults (when no env overrides):
 *   - OBS core: enabled
 *   - everything else: disabled
 * - Overrides:
 *   - SERVICE_ACTIONS_ENABLE_ALL=true enables all services
 *   - <SERVICE>_ACTIONS_ENABLE=true|false sets per-service enable
 */
export function isServiceActionsEnabled(serviceName: string): boolean {
  const enableAll = envBool('SERVICE_ACTIONS_ENABLE_ALL', false);
  const defaultEnabled = enableAll ? true : isObsCoreDefaultEnabled(serviceName);

  // Per-service override uses the exact env var names listed in requirements:
  // e.g. GO_ACTIONS_ENABLE, SPRING_JVM_TOMCAT_PLATFORM_ACTIONS_ENABLE, etc.
  const key = `${serviceName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ACTIONS_ENABLE`;
  return envBool(key, defaultEnabled);
}

export function resolveServiceActionFlags(serviceName: string): ServiceActionFlags {
  const enabled = isServiceActionsEnabled(serviceName);
  return {
    start: enabled,
    restart: enabled,
    stop: enabled,
    recreate: enabled,
    delete: enabled,
  };
}
