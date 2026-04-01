import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockEventSource } from '@/__tests__/_helpers/useJobRunner.test-helpers';

vi.mock('@/app/hooks/useAppLogsConfig', () => ({
  useAppLogsConfig: () => ({
    config: { clientMaxEntries: 1000, serverMaxEntries: 2000 },
    loading: false,
    error: null,
    refresh: async () => undefined,
  }),
}));

import AppLogs from '@/app/components/AppLogs';


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

    expect(await screen.findByText(/RID abc123/i)).toBeInTheDocument();
  });
});