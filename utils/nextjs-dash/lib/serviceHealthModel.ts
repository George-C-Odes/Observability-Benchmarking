export interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'pending';
  responseTime?: number;
  baseUrl?: string;
  error?: string;
  body?: unknown;
}

export type ServiceMessage = {
  type: 'success' | 'error';
  text: string;
  service?: string;
};

export function toPending(next: ServiceHealth): ServiceHealth {
  return {
    ...next,
    status: 'pending',
  };
}

export interface HealthApiService {
  name?: unknown;
  status?: unknown;
  responseTime?: unknown;
  baseUrl?: unknown;
  error?: unknown;
  body?: unknown;
}

export function normalizeServiceFromApi(raw: HealthApiService | null | undefined): ServiceHealth {
  const name = typeof raw?.name === 'string' ? raw.name : 'unknown';
  const rawStatus = raw?.status;

  const status: ServiceHealth['status'] =
    rawStatus === 'up' || rawStatus === 'down' || rawStatus === 'pending'
      ? rawStatus
      : rawStatus === 'UP'
        ? 'up'
        : rawStatus === 'DOWN'
          ? 'down'
          : rawStatus === 'PENDING'
            ? 'pending'
            : 'down';

  return {
    name,
    status,
    responseTime: typeof raw?.responseTime === 'number' ? raw.responseTime : undefined,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl : undefined,
    error: typeof raw?.error === 'string' ? raw.error : undefined,
    body: raw?.body,
  };
}

export function byName(a: ServiceHealth, b: ServiceHealth) {
  return a.name.localeCompare(b.name);
}

export function countByStatus(services: ServiceHealth[]): {
  up: number;
  down: number;
  pending: number;
  total: number;
} {
  let up = 0;
  let down = 0;
  let pending = 0;

  for (const s of services) {
    if (s.status === 'up') up += 1;
    else if (s.status === 'pending') pending += 1;
    else down += 1;
  }

  return { up, down, pending, total: services.length };
}

export function formatRelativeSince(nowMs: number, thenMs: number): string {
  const deltaMs = Math.max(0, nowMs - thenMs);

  if (deltaMs < 5_000) return 'Just now';
  if (deltaMs < 60_000) return `${Math.floor(deltaMs / 1_000)}s ago`;
  if (deltaMs < 60 * 60_000) return `${Math.floor(deltaMs / 60_000)}m ago`;
  if (deltaMs < 24 * 60 * 60_000) return `${Math.floor(deltaMs / (60 * 60_000))}h ago`;

  // Older than a day: show an explicit date+time.
  return new Date(thenMs).toLocaleString();
}

export function formatExactTime(d: Date): string {
  // Keep it short and consistent (HH:MM:SS), independent of locale.
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
