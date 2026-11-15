import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServiceHealthClient } from '@/lib/serviceHealthClient';
import { fetchJson } from '@/lib/fetchJson';
import {
  byName,
  countByStatus,
  formatExactTime,
  formatRelativeSince,
  normalizeServiceFromApi,
  toPending,
} from '@/lib/serviceHealthModel';

afterEach(() => vi.restoreAllMocks());

describe('service health model', () => {
  it.each(['up', 'down', 'pending', 'UP', 'DOWN', 'PENDING'])(
    'normalizes the %s API status',
    (status) => {
      expect(
        normalizeServiceFromApi({
          name: 'go',
          status,
          responseTime: 12,
          baseUrl: 'http://go:8080',
          error: 'details',
          body: { result: true },
        }),
      ).toEqual({
        name: 'go',
        status: status.toLowerCase(),
        responseTime: 12,
        baseUrl: 'http://go:8080',
        error: 'details',
        body: { result: true },
      });
    },
  );
  it('defaults malformed health entries to a safe display state', () => {
    expect(normalizeServiceFromApi(null)).toEqual({
      name: 'unknown',
      status: 'down',
      responseTime: undefined,
      baseUrl: undefined,
      error: undefined,
      body: undefined,
    });
    expect(
      normalizeServiceFromApi({ name: 42, status: 'INVALID', responseTime: '12', error: 42 }),
    ).toMatchObject({ name: 'unknown', status: 'down', responseTime: undefined, error: undefined });
  });
  it('counts statuses and preserves data during an optimistic action', () => {
    const up = normalizeServiceFromApi({ name: 'go', status: 'UP', body: 'healthy' });
    const pending = toPending(up);
    expect(pending).toEqual({ ...up, status: 'pending' });
    expect(up.status).toBe('up');
    expect(countByStatus([up, pending, normalizeServiceFromApi(null)])).toEqual({
      up: 1,
      down: 1,
      pending: 1,
      total: 3,
    });
    expect([up, { ...up, name: 'alloy' }].sort(byName).map((s) => s.name)).toEqual(['alloy', 'go']);
  });
  it.each([
    [0, 'Just now'],
    [6000, '6s ago'],
    [120000, '2m ago'],
    [7200000, '2h ago'],
  ])('formats elapsed time %s', (elapsed, expected) => {
    expect(formatRelativeSince(Number(elapsed), 0)).toBe(expected);
  });
  it('shows the explicit date for old data and a clock time for tooltips', () => {
    const then = new Date(2026, 0, 1, 12, 34, 56);
    expect(formatRelativeSince(then.getTime() + 86400000, then.getTime())).toBe(
      then.toLocaleString(),
    );
    expect(formatExactTime(then)).toContain('34');
  });
});

describe('service health request boundary', () => {
  it.each([
    '../admin',
    '%2e%2e',
    'go?x=1',
    'go#x',
    'go/service',
    'go\n',
    'https://evil.example',
    '',
  ])('rejects malicious service %j without requests', async (service) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = createServiceHealthClient(fetchJson);
    await expect(client.readOne(service)).rejects.toThrow('Invalid service');
    await expect(client.submitAction({ service, action: 'start' })).rejects.toThrow(
      'Invalid service',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects unsupported actions before making requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      createServiceHealthClient(fetchJson).submitAction({
        service: 'go',
        action: 'destroy' as never,
      }),
    ).rejects.toThrow('Invalid service action');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('uses fixed same-origin operations and keeps returned base URLs as display data', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          services: [
            { name: 'go', status: 'UP', baseUrl: 'https://evil.example' },
            { name: 'alloy', status: 'DOWN' },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ services: [{ name: 'go', status: 'UP' }] }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const client = createServiceHealthClient(fetchJson);
    expect((await client.readAll()).map((s) => s.name)).toEqual(['alloy', 'go']);
    expect(await client.readOne('go')).toMatchObject({ name: 'go', status: 'up' });
    await client.submitAction({ service: 'go', action: 'restart' });
    expect(fetchSpy.mock.calls).toEqual([
      ['/api/health', { redirect: 'error' }],
      ['/api/health?service=go', { redirect: 'error' }],
      [
        '/api/docker/control',
        {
          redirect: 'error',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: 'go', action: 'restart' }),
        },
      ],
    ]);
  });
  it('handles an empty list or missing individual result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
    const client = createServiceHealthClient(fetchJson);
    expect(await client.readAll()).toEqual([]);
    expect(await client.readOne('go')).toBeNull();
  });
});
