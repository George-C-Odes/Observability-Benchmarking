import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import AppLogs from './AppLogs';

class MockEventSource {
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    // no-op
  }

  close() {
    // no-op
  }
}

describe('AppLogs', () => {
  it('renders RID chip for server logs with requestId meta', async () => {
    // @ts-expect-error test override
    globalThis.EventSource = MockEventSource;

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
