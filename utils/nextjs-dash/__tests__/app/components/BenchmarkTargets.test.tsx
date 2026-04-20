import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  clientLogger: {
    createClientLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  inwardPulse: { InwardPulse: () => null },
  timedPulse: { useTimedPulse: () => ({ on: false, fire: vi.fn() }) },
}));

vi.mock('@/lib/clientLogger', () => mocks.clientLogger);
vi.mock('@/app/components/ui/InwardPulse', () => mocks.inwardPulse);
vi.mock('@/app/hooks/useTimedPulse', () => mocks.timedPulse);
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<typeof import('@mui/material')>('@mui/material');
  return {
    ...actual,
    Fade: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactElement }) => children,
  };
});

import BenchmarkTargets from '@/app/components/BenchmarkTargets';

function countMatcher(expected: string) {
  return (_content: string, element: Element | null) => element?.textContent === expected;
}

async function waitForSelectedCount(expected: string) {
  await waitFor(() => {
    expect(screen.getByText(countMatcher(expected))).toBeInTheDocument();
  });
}

type FetchState = {
  urls: string[];
  getStatus: number;
  postStatus: number;
  lastPostBody: unknown;
};

const fetchState: FetchState = {
  urls: [],
  getStatus: 200,
  postStatus: 200,
  lastPostBody: null,
};

function installFetchMock() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url === '/api/benchmark-targets' && method === 'GET') {
      return fetchState.getStatus === 200
        ? new Response(JSON.stringify({ urls: fetchState.urls }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('load failed', { status: fetchState.getStatus });
    }

    if (url === '/api/benchmark-targets' && method === 'POST') {
      fetchState.lastPostBody = init?.body ? JSON.parse(String(init.body)) : null;
      return fetchState.postStatus === 200
        ? new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('save failed', { status: fetchState.postStatus });
    }

    return new Response('not found', { status: 404 });
  });
}

describe('BenchmarkTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchState.urls = [
      'http://quarkus-jvm:8080/hello/platform',
      'http://go:8080/hello/virtual',
    ];
    fetchState.getStatus = 200;
    fetchState.postStatus = 200;
    fetchState.lastPostBody = null;
    installFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('loads targets, shows counts, and renders grouped sections', async () => {
    render(<BenchmarkTargets />);

    expect(await screen.findByText('Benchmark Targets')).toBeInTheDocument();
    expect(screen.getByText(countMatcher('2 / 33 selected'))).toBeInTheDocument();
    expect(screen.getByText('Quick filters (toggle groups)')).toBeInTheDocument();
    expect(screen.getByText('spring')).toBeInTheDocument();
    expect(screen.getAllByText('JVM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Native').length).toBeGreaterThan(0);
    expect(screen.getByText('go')).toBeInTheDocument();
    expect(screen.getByText('django')).toBeInTheDocument();
  });

  it('applies All and None quick filters', async () => {
    render(<BenchmarkTargets />);

    await waitForSelectedCount('2 / 33 selected');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitForSelectedCount('33 / 33 selected');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    await waitForSelectedCount('0 / 33 selected');
  }, 10000);

  it('saves selected targets in canonical endpoint order', async () => {
    fetchState.urls = [];
    render(<BenchmarkTargets />);

    await screen.findByText(countMatcher('0 / 33 selected'));

    fireEvent.click(screen.getByRole('button', { name: 'http://quarkus-jvm:8080/hello/virtual' }));
    fireEvent.click(screen.getByRole('button', { name: 'http://spring-jvm-tomcat-platform:8080/hello/platform' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Saved 2 benchmark target(s)')).toBeInTheDocument();
    expect(fetchState.lastPostBody).toEqual({
      urls: [
        'http://spring-jvm-tomcat-platform:8080/hello/platform',
        'http://quarkus-jvm:8080/hello/virtual',
      ],
    });
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  }, 10000);

  it('shows an error when reloading or saving fails', async () => {
    const user = userEvent.setup();
    render(<BenchmarkTargets />);

    await screen.findByText(countMatcher('2 / 33 selected'));

    fetchState.getStatus = 500;
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('Failed to load benchmark targets')).toBeInTheDocument();

    fetchState.getStatus = 200;
    await user.click(screen.getByRole('button', { name: 'All' }));
    fetchState.postStatus = 500;
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save benchmark targets')).toBeInTheDocument();
    });
  }, 10000);
});

