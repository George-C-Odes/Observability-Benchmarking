import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

// Avoid noisy logging during tests.
vi.mock('@/lib/serverLogger', () => ({
  serverLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('/api/service-actions/config route', () => {
  it('returns resolved enabled flags (no-store)', async () => {
    process.env.SERVICE_ACTIONS_ENABLE_ALL = 'false';
    process.env.GO_ACTIONS_ENABLE = 'true';

    const req = new NextRequest('http://localhost/api/service-actions/config', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const json = (await res.json()) as { enabled: Record<string, boolean> };
    expect(json.enabled.go).toBe(true);

    // Sanity: OBS default stays enabled.
    expect(json.enabled.grafana).toBe(true);
  });
});
