import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Ensure AppLogs doesn't consume our first fetch mock for its config.
vi.mock('@/app/hooks/useAppLogsConfig', () => ({
  useAppLogsConfig: () => ({
    config: { clientMaxEntries: 1000, serverMaxEntries: 2000 },
    loading: false,
    error: null,
    refresh: async () => undefined,
  }),
}));

import AppLogs from './AppLogs';

class MockEventSource {
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    // no-op
    void this.onmessage;
    void this.onerror;
  }

  close() {
    // no-op
  }
}

declare global {
  interface GlobalThis {
    EventSource: typeof EventSource;
  }
}

describe('AppLogs', () => {
  it('renders RID chip for server logs with requestId meta', async () => {
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entries: [
            {
              ts: Date.now(),
              level: 'info',
              source: 'server',
              message: 'hello',
              meta: { requestId: 'abc123def456' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<AppLogs />);

    // fallback snapshot should populate and render RID chip
    expect(await screen.findByText(/RID abc123/i)).toBeInTheDocument();
  });
});
