export type ServiceAction = 'restart' | 'stop' | 'recreate' | 'delete';

export type ServiceActionFlags = {
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

export function getDefaultServiceActionFlags(): ServiceActionFlags {
  // Defaults requested:
  // - Observability stack group services: true
  // - Everything else: false
  // For Docker compose deployment (nextjs-dash service), we want everything true by default.
  // We'll support both via env override.
  const defaultAll = envBool('SERVICE_ACTIONS_ENABLE_ALL', true);

  if (defaultAll) {
    return { restart: true, stop: true, recreate: true, delete: true };
  }

  return { restart: false, stop: false, recreate: false, delete: false };
}

export function resolveServiceActionFlags(serviceName: string): ServiceActionFlags {
  const defaults = getDefaultServiceActionFlags();

  // Local defaults: only observability core is enabled.
  const isObsCore = ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(serviceName);

  const base: ServiceActionFlags = isObsCore
    ? { restart: true, stop: true, recreate: true, delete: true }
    : { ...defaults };

  // Per-service overrides (optional): SERVICE_<SERVICE>_ACTIONS_RESTART=true, etc.
  const prefix = `SERVICE_${serviceName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ACTIONS_`;
  const restart = envBool(`${prefix}RESTART`, base.restart);
  const stop = envBool(`${prefix}STOP`, base.stop);
  const recreate = envBool(`${prefix}RECREATE`, base.recreate);
  const del = envBool(`${prefix}DELETE`, base.delete);

  return { restart, stop, recreate, delete: del };
}

// (intentionally no extra helpers here; keep this module tiny)
