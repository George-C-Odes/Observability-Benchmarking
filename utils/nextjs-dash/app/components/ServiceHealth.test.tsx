import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    if (url === '/api/health') {
      return { services };
    }

    if (url === '/api/orchestrator/submit') {
      // Sanity: ensure caller sends JSON.
      expect(init?.method).toBe('POST');
      const parsed = JSON.parse(String(init?.body || '{}')) as { command?: string };
      expect(typeof parsed.command).toBe('string');
      return { success: true, jobId: 'job-1' };
    }

    throw new Error(`Unexpected fetchJson call: ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
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

    await user.click(screen.getByLabelText('--force-recreate'));

    const startButton = await screen.findByLabelText('Start');
    await user.click(startButton);

    // Health refresh calls can happen after submit; assert the submit call happened.
    expect(fetchJson).toHaveBeenCalledWith(
      '/api/orchestrator/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'docker compose up -d --force-recreate wrk2' }),
      })
    );

    // Optimistic pending.
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
  });

  it('submits Stop with delete container option when checked', async () => {
    mockHealthResponse([{ name: 'orchestrator', status: 'up', baseUrl: 'http://orchestrator:3000' }]);

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('orchestrator')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Delete container'));

    const stopButton = await screen.findByLabelText('Stop');
    await user.click(stopButton);

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/orchestrator/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'docker compose stop orchestrator; docker compose rm -f orchestrator' }),
      })
    );
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

