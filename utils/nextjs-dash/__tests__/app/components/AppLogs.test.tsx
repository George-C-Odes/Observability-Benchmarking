import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockEventSource } from '@/__tests__/_helpers/useJobRunner.test-helpers';

type ClientEntry = {
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
};

const clientLogsMock = vi.hoisted(() => ({
  clearClientLogs: vi.fn(),
  setClientLogsMaxEntries: vi.fn(),
  subscribeClientLogs: vi.fn(),
}));

vi.mock('@/lib/clientLogs', () => clientLogsMock);

vi.mock('@/app/hooks/useAppLogsConfig', () => ({
  useAppLogsConfig: () => ({
    config: { clientMaxEntries: 1000, serverMaxEntries: 2000 },
    loading: false,
    error: null,
    refresh: async () => undefined,
  }),
}));

import AppLogs from '@/app/components/AppLogs';

function snapshotResponse(entries: unknown[] = []) {
  return new Response(JSON.stringify({ entries }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AppLogs', () => {
  let publishClientLogs: (entries: ClientEntry[]) => void;

  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
    clientLogsMock.subscribeClientLogs.mockImplementation(
      (subscriber: (entries: ClientEntry[]) => void) => {
        publishClientLogs = subscriber;
        subscriber([]);
        return vi.fn();
      },
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(snapshotResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    MockEventSource.instances = [];
  });

  it('renders request metadata from the initial server snapshot', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      snapshotResponse([
        {
          ts: Date.now(),
          level: 'info',
          source: 'server',
          message: 'hello',
          meta: { requestId: 'abc123def456' },
        },
      ]),
    );

    render(<AppLogs />);

    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.getByText(/RID abc123/i)).toBeInTheDocument();
    expect(clientLogsMock.setClientLogsMaxEntries).toHaveBeenCalledWith(1000);
  });

  it('accepts valid SSE messages and ignores malformed payloads', async () => {
    render(<AppLogs />);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    const eventSource = MockEventSource.instances[0];
    expect(eventSource.url).toBe('/api/logs/stream');

    act(() => {
      eventSource.emitMessage('not-json');
      eventSource.emitMessage(JSON.stringify({ ts: 200, level: 'warn', message: 'live log' }));
      eventSource.emitMessage(JSON.stringify({ ts: 0, level: 'info', message: 'invalid log' }));
    });

    expect(await screen.findByText('live log')).toBeInTheDocument();
    expect(screen.queryByText('invalid log')).not.toBeInTheDocument();
  });

  it('filters client and server entries by source', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      snapshotResponse([{ ts: 100, level: 'warn', source: 'server', message: 'server warning' }]),
    );
    render(<AppLogs />);

    expect(await screen.findByText('server warning')).toBeInTheDocument();
    act(() => {
      publishClientLogs([{ ts: 200, level: 'debug', message: 'client detail' }]);
    });
    expect(await screen.findByText('client detail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Server' }));
    expect(screen.getByText('server warning')).toBeInTheDocument();
    expect(screen.queryByText('client detail')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Client' }));
    expect(screen.queryByText('server warning')).not.toBeInTheDocument();
    expect(screen.getByText('client detail')).toBeInTheDocument();
  });

  it('falls back to another snapshot when the SSE connection fails', async () => {
    render(<AppLogs />);
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));

    act(() => {
      MockEventSource.instances[0].emitError();
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(MockEventSource.instances[0].close).toHaveBeenCalledOnce();
  });

  it('clears client and server logs through their owning boundaries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      snapshotResponse([{ ts: 100, level: 'info', source: 'server', message: 'to clear' }]),
    );
    render(<AppLogs />);
    expect(await screen.findByText('to clear')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(clientLogsMock.clearClientLogs).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/logs', {
        method: 'DELETE',
      }),
    );
    expect(screen.queryByText('to clear')).not.toBeInTheDocument();
  });
});
