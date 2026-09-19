import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/__tests__/_helpers/mockOrchestratorConfig';
import '@/__tests__/_helpers/mockScopedServerLogger';

import { GET } from '@/app/api/health/route';

describe('/api/health route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards service-filtered health responses from the orchestrator', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":"UP"}', {
        status: 207,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await GET(new Request('http://localhost/api/health?service=tempo') as never);

    expect(fetchSpy).toHaveBeenCalledWith('http://orchestrator:3002/v1/health?service=tempo');
    expect(res.status).toBe(207);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    await expect(res.text()).resolves.toBe('{"status":"UP"}');
  });

  it('returns a structured error when the upstream request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const res = await GET(new Request('http://localhost/api/health') as never);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Failed to fetch service health');
  });
});
