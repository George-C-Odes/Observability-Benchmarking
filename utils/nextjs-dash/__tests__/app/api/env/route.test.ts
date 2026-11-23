import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/orchestratorClient', () => {
  return {
    getEnvFile: vi.fn(),
    updateEnvFile: vi.fn(),
  };
});

import * as orch from '@/lib/orchestratorClient';
import { GET, POST } from '@/app/api/env/route';

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
    vi.mocked(orch.getEnvFile).mockResolvedValue({
      content: 'A: 1\n  HOST_REPO: C:\\bench\\repo\nB: 2',
    });

    const req = new NextRequest('http://localhost/api/env', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validation).toEqual({ loaded: true, hostRepoSet: true });
  });

  it.each(['  HOST_REPO:  ', undefined, 123])(
    'GET leaves hostRepoSet=false for missing or unusable content %j',
    async (content) => {
      vi.mocked(orch.getEnvFile).mockResolvedValue({ content: content as string });
      const res = await GET(new NextRequest('http://localhost/api/env'));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        validation: { loaded: true, hostRepoSet: false },
      });
    },
  );

  it('GET returns a fetch failure when the orchestrator rejects the read', async () => {
    vi.mocked(orch.getEnvFile).mockRejectedValue(new Error('Orchestrator unavailable'));
    const res = await GET(new NextRequest('http://localhost/api/env'));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Failed to fetch env' });
  });

  it('POST returns 400 when content is not a string', async () => {
    const req = new NextRequest('http://localhost/api/env', {
      method: 'POST',
      body: JSON.stringify({ content: 123 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(orch.updateEnvFile).not.toHaveBeenCalled();
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

  it('POST returns an update failure when the orchestrator rejects the write', async () => {
    vi.mocked(orch.updateEnvFile).mockRejectedValue(new Error('Write failed'));
    const res = await POST(
      new NextRequest('http://localhost/api/env', {
        method: 'POST',
        body: JSON.stringify({ content: 'A: 2' }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Failed to update env' });
  });
});
