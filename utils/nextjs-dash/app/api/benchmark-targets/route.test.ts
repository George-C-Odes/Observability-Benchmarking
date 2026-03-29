import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock orchestrator client used by the route.
vi.mock('@/lib/orchestratorClient', () => {
  return {
    getBenchmarkTargets: vi.fn(),
    updateBenchmarkTargets: vi.fn(),
  };
});

import * as orch from '@/lib/orchestratorClient';
import { GET, POST } from './route';

describe('/api/benchmark-targets route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET returns benchmark target URLs', async () => {
    const mockUrls = [
      'http://quarkus-jvm:8080/hello/platform',
      'http://spring-jvm-tomcat-platform:8080/hello/platform',
    ];
    vi.mocked(orch.getBenchmarkTargets).mockResolvedValue({ urls: mockUrls });

    const req = new NextRequest('http://localhost/api/benchmark-targets', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.urls).toEqual(mockUrls);
  });

  it('GET returns 500 when orchestrator fails', async () => {
    vi.mocked(orch.getBenchmarkTargets).mockRejectedValue(new Error('connection refused'));

    const req = new NextRequest('http://localhost/api/benchmark-targets', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it('POST returns 400 when urls is not an array', async () => {
    const req = new NextRequest('http://localhost/api/benchmark-targets', {
      method: 'POST',
      body: JSON.stringify({ urls: 'not-an-array' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST returns 400 when urls is missing', async () => {
    const req = new NextRequest('http://localhost/api/benchmark-targets', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST updates benchmark targets', async () => {
    vi.mocked(orch.updateBenchmarkTargets).mockResolvedValue(undefined);

    const urls = ['http://quarkus-jvm:8080/hello/platform'];
    const req = new NextRequest('http://localhost/api/benchmark-targets', {
      method: 'POST',
      body: JSON.stringify({ urls }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(orch.updateBenchmarkTargets).toHaveBeenCalledWith(urls);
  });
});