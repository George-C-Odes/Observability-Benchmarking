import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useServiceHealth } from '@/app/hooks/useServiceHealth';
import type { ServiceHealthClient } from '@/lib/serviceHealthClient';
import type { ServiceHealth } from '@/lib/serviceHealthModel';

vi.mock('@/app/hooks/useServiceActionsConfig', () => ({ useServiceActionsConfig: () => ({}) }));
vi.mock('@/app/hooks/useTimedPulse', () => ({ useTimedPulse: () => ({ on: false }) }));

afterEach(() => vi.useRealTimers());

const health = (name: string, status: ServiceHealth['status'] = 'up'): ServiceHealth => ({
  name,
  status,
});

async function setup() {
  const client = {
    readAll: vi
      .fn<ServiceHealthClient['readAll']>()
      .mockResolvedValue([health('alloy'), health('grafana')]),
    readOne: vi.fn<ServiceHealthClient['readOne']>(),
    submitAction: vi.fn<ServiceHealthClient['submitAction']>(),
  };
  const hook = renderHook(() => useServiceHealth(client));
  await act(async () => {});
  return { ...hook, client };
}

describe('useServiceHealth concurrent reads', () => {
  it.each([false, true])(
    'keeps each service busy until its own refresh settles (failure=%s)',
    async (failure) => {
      const { result, client } = await setup();
      const alloy = Promise.withResolvers<ServiceHealth | null>();
      const grafana = Promise.withResolvers<ServiceHealth | null>();
      client.readOne.mockReturnValueOnce(alloy.promise).mockReturnValueOnce(grafana.promise);
      let first: Promise<void>, second: Promise<void>;
      act(() => {
        first = result.current.refreshService('alloy');
        second = result.current.refreshService('grafana');
      });
      expect([...result.current.refreshing].sort()).toEqual(['alloy', 'grafana']);
      await act(async () => {
        if (failure) alloy.reject(new Error('offline'));
        else alloy.resolve(health('alloy', 'down'));
        await first;
      });
      expect([...result.current.refreshing]).toEqual(['grafana']);
      await act(async () => {
        grafana.resolve(health('grafana'));
        await second;
      });
      expect(result.current.refreshing.size).toBe(0);
    },
  );

  it('does not let an older individual read overwrite Refresh All or its timestamp', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { result, client } = await setup();
    const older = Promise.withResolvers<ServiceHealth | null>();
    client.readOne.mockReturnValueOnce(older.promise);
    let pending: Promise<void>;
    act(() => {
      pending = result.current.refreshService('alloy');
    });
    client.readAll.mockResolvedValueOnce([health('alloy', 'down'), health('grafana')]);
    await act(async () => {
      await result.current.fetchAllServices();
    });
    const updated = result.current.lastUpdatedAt;
    vi.setSystemTime(Date.now() + 5000);
    await act(async () => {
      older.resolve(health('alloy'));
      await pending;
    });
    expect(
      result.current.groupedServices.observability.find((s) => s.name === 'alloy')?.status,
    ).toBe('down');
    expect(result.current.lastUpdatedAt).toBe(updated);
  });

  it.each([false, true])(
    'preserves a newer individual result when an older list finishes (omitted=%s)',
    async (omitted) => {
      const { result, client } = await setup();
      const older = Promise.withResolvers<ServiceHealth[]>();
      client.readAll.mockReturnValueOnce(older.promise);
      let pending: Promise<void>;
      act(() => {
        pending = result.current.fetchAllServices();
      });
      client.readOne.mockResolvedValueOnce(health('alloy', 'down'));
      await act(async () => {
        await result.current.refreshService('alloy');
      });
      await act(async () => {
        older.resolve(
          omitted ? [health('grafana', 'down')] : [health('alloy'), health('grafana', 'down')],
        );
        await pending;
      });
      expect(result.current.groupedServices.observability.map((s) => [s.name, s.status])).toEqual([
        ['alloy', 'down'],
        ['grafana', 'down'],
      ]);
    },
  );

  it('keeps duplicate refreshes busy and accepts only the latest result for a service', async () => {
    const { result, client } = await setup();
    const older = Promise.withResolvers<ServiceHealth | null>();
    client.readOne
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(health('alloy', 'down'));
    let pending: Promise<void>;
    act(() => {
      pending = result.current.refreshService('alloy');
    });
    await act(async () => {
      await result.current.refreshService('alloy');
    });
    expect(result.current.refreshing.has('alloy')).toBe(true);
    await act(async () => {
      older.resolve(health('alloy'));
      await pending;
    });
    expect(result.current.refreshing.size).toBe(0);
    expect(result.current.groupedServices.observability[0].status).toBe('down');
  });
});
