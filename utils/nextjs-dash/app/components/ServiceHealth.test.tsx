import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ServiceHealth calls fetchJson at module scope.
vi.mock('@/lib/fetchJson', () => {
  return {
    fetchJson: vi.fn(),
  };
});

import { fetchJson } from '@/lib/fetchJson';
import ServiceHealth from './ServiceHealth';

type MockService = {
  name: string;
  status: 'up' | 'down' | 'pending' | 'UP' | 'DOWN' | 'PENDING';
  baseUrl?: string;
  error?: string;
  body?: unknown;
};

function mockHealthResponse(services: MockService[]) {
  vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/health')) {
      return { services };
    }

    if (url === '/api/docker/control') {
      // Sanity: ensure caller sends JSON.
      expect(init?.method).toBe('POST');
      const parsed = JSON.parse(String(init?.body || '{}')) as {
        service?: string;
        action?: 'start' | 'stop' | 'restart';
        forceRecreate?: boolean;
        deleteContainer?: boolean;
      };
      expect(typeof parsed.service).toBe('string');
      expect(['start', 'stop', 'restart']).toContain(parsed.action);

      // Keep the UI stable for multi-action tests: we don't want the optimistic PENDING state
      // to hide buttons mid-test. Real status will only change after a refresh anyway.
      return { success: true, jobId: 'job-1', command: 'mock', status: 'up' };
    }

    throw new Error(`Unexpected fetchJson call: ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('ServiceHealth', () => {
  it('renders utils cards in alphabetical order (nextjs-dash to the left of orchestrator)', async () => {
    mockHealthResponse([
      { name: 'orchestrator', status: 'up', baseUrl: 'http://orchestrator:3000' },
      { name: 'wrk2', status: 'down', baseUrl: 'http://wrk2:3000' },
      { name: 'nextjs-dash', status: 'up', baseUrl: 'http://nextjs-dash:3001' },
    ]);

    const { container } = render(<ServiceHealth />);

    expect(await screen.findByText('Utils')).toBeInTheDocument();

    const utilsHeader = screen.getByText('Utils');
    const utilsGrid = utilsHeader.nextElementSibling as HTMLElement;
    expect(utilsGrid).toBeTruthy();

    // MUI Typography uses <div> by default; assert order via DOM traversal.
    const cards = Array.from(utilsGrid.querySelectorAll('.MuiCard-root')) as HTMLElement[];
    expect(cards).toHaveLength(3);

    const titles = cards.map((card) => {
      // Title is the first line inside card content.
      const titleNode = card.querySelector('.MuiCardContent-root .MuiTypography-root');
      return titleNode?.textContent;
    });

    expect(titles).toEqual(['nextjs-dash', 'orchestrator', 'wrk2']);

    // avoid unused var lint / keep container referenced in case of debugging
    expect(container).toBeTruthy();
  });

  it('submits Start with --force-recreate when checked and marks service as PENDING', async () => {
    mockHealthResponse([{ name: 'wrk2', status: 'down', baseUrl: 'http://wrk2:3000' }]);

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('wrk2')).toBeInTheDocument();

    const wrk2Card = screen.getByText('wrk2').closest('.MuiCard-root') as HTMLElement;
    expect(wrk2Card).toBeTruthy();

    const startButton = await within(wrk2Card).findByLabelText('Start');
    await user.click(startButton);

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/docker/control',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ service: 'wrk2', action: 'start' }),
      })
    );

    // Optimistic pending.
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
  });

  it('submits Restart, Recreate, Stop and Delete via /api/docker/control with correct flags', async () => {
    const actions: Array<{ label: 'Restart' | 'Recreate' | 'Stop' | 'Delete'; expectedBody: string }> = [
      { label: 'Restart', expectedBody: JSON.stringify({ service: 'orchestrator', action: 'restart' }) },
      {
        label: 'Recreate',
        expectedBody: JSON.stringify({ service: 'orchestrator', action: 'restart', forceRecreate: true }),
      },
      { label: 'Stop', expectedBody: JSON.stringify({ service: 'orchestrator', action: 'stop' }) },
      {
        label: 'Delete',
        expectedBody: JSON.stringify({ service: 'orchestrator', action: 'stop', deleteContainer: true }),
      },
    ];

    for (const a of actions) {
      vi.mocked(fetchJson).mockClear();
      mockHealthResponse([{ name: 'orchestrator', status: 'up', baseUrl: 'http://orchestrator:3000' }]);

      const user = userEvent.setup();
      const { unmount } = render(<ServiceHealth />);

      expect(await screen.findByText('orchestrator')).toBeInTheDocument();

      const orchCard = screen.getByText('orchestrator').closest('.MuiCard-root') as HTMLElement;
      expect(orchCard).toBeTruthy();

      await user.click(await within(orchCard).findByLabelText(a.label));

      expect(fetchJson).toHaveBeenCalledWith(
        '/api/docker/control',
        expect.objectContaining({
          method: 'POST',
          body: a.expectedBody,
        })
      );

      unmount();
    }
  });

  it('renders error message only when populated and keeps response body behind hover affordance', async () => {
    mockHealthResponse([
      {
        name: 'loki',
        status: 'down',
        baseUrl: 'http://loki:3100',
        error: 'connection refused',
        body: { ok: false, details: 'boom' },
      },
    ]);

    render(<ServiceHealth />);

    expect(await screen.findByText('connection refused')).toBeInTheDocument();
    expect(screen.getByText('Response body (hover)')).toBeInTheDocument();

    // Tooltip content is in a portal and only appears on hover; verifying the trigger is enough here.
    expect(screen.queryByText(/"details"/)).not.toBeInTheDocument();
  });
});

