import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config', () => ({
  orchestratorConfig: {
    url: 'http://orchestrator:3002',
    apiKey: 'x',
    timeout: 60000,
  },
}));

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { GET } from '@/app/api/app-health/route';

describe('/api/app-health route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports orchestrator UP when the readiness probe succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('UP');
    expect(body.application).toBe('nextjs-dash');
    expect(body.checks).toEqual({ api: 'UP', orchestrator: 'UP' });
  });

  it('reports orchestrator DOWN when the readiness probe fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.checks.orchestrator).toBe('DOWN');
    expect(typeof body.timestamp).toBe('string');
  });
});

