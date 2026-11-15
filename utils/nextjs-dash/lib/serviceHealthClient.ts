import { fetchJson } from './fetchJson';
import { byName, normalizeServiceFromApi, type HealthApiService } from './serviceHealthModel';

type Action = 'start' | 'stop' | 'restart' | 'recreate' | 'delete';
function validateService(service: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(service)) throw new Error('Invalid service name');
}

// Names from UI/API responses are untrusted. Only fixed same-origin operations
// are available; service names are validated and encoded as query values.
// Response baseUrl is display data and is never a request destination.
export function createServiceHealthClient(readJson: typeof fetchJson) {
  return {
    async readAll() {
      const data = await readJson<{ services?: HealthApiService[] }>('/api/health', {
        redirect: 'error',
      });
      return (data.services || []).map(normalizeServiceFromApi).sort(byName);
    },
    async readOne(service: string) {
      validateService(service);
      const data = await readJson<{ services?: HealthApiService[] }>(
        `/api/health?service=${encodeURIComponent(service)}`,
        { redirect: 'error' },
      );
      const raw = Array.isArray(data?.services) && data.services.length ? data.services[0] : null;
      return raw ? normalizeServiceFromApi(raw) : null;
    },
    async submitAction(payload: { service: string; action: Action }) {
      validateService(payload.service);
      if (!['start', 'stop', 'restart', 'recreate', 'delete'].includes(payload.action))
        throw new Error('Invalid service action');
      await readJson('/api/docker/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
      });
    },
  };
}
export type ServiceHealthClient = ReturnType<typeof createServiceHealthClient>;
export const serviceHealthClient = createServiceHealthClient(fetchJson);
