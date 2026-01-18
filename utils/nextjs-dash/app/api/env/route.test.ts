import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock orchestrator client used by the route.
vi.mock('@/lib/orchestratorClient', () => {
  return {
    getEnvFile: vi.fn(),
    updateEnvFile: vi.fn(),
  };
});

import * as orch from '@/lib/orchestratorClient';
import { GET, POST } from './route';

describe('/api/env route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET returns env content (plus validation metadata)', async () => {
    vi.mocked(orch.getEnvFile).mockResolvedValue({ content: 'A: 1' });

    const req = new NextRequest('http://localhost/api/env', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      content: 'A: 1',
      validation: {
        loaded: true,
        hostRepoSet: false,
      },
    });
  });

  it('GET sets hostRepoSet=true when HOST_REPO is present', async () => {
    vi.mocked(orch.getEnvFile).mockResolvedValue({ content: 'A: 1\nHOST_REPO: /tmp/repo\nB: 2' });

    const req = new NextRequest('http://localhost/api/env', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation).toEqual({ loaded: true, hostRepoSet: true });
  });

  it('POST returns 400 when content is not a string', async () => {
    const req = new NextRequest('http://localhost/api/env', {
      method: 'POST',
      body: JSON.stringify({ content: 123 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST updates env content', async () => {
    vi.mocked(orch.updateEnvFile).mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/env', {
      method: 'POST',
      body: JSON.stringify({ content: 'A: 2' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(orch.updateEnvFile).toHaveBeenCalledWith('A: 2');
  });
});
