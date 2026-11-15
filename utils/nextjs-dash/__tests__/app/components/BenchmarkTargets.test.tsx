import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

vi.mock(
  '@/lib/clientLogger',
  async () => (await import('@/__tests__/_helpers/componentModuleMocks')).CLIENT_LOGGER_MODULE_MOCK,
);
vi.mock(
  '@/app/components/ui/InwardPulse',
  async () => (await import('@/__tests__/_helpers/componentModuleMocks')).INWARD_PULSE_MODULE_MOCK,
);
vi.mock(
  '@/app/hooks/useTimedPulse',
  async () => (await import('@/__tests__/_helpers/componentModuleMocks')).TIMED_PULSE_MODULE_MOCK,
);
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<typeof import('@mui/material')>('@mui/material');
  return {
    ...actual,
    Chip: ({
      label,
      onClick,
      disabled,
      children,
      ...props
    }: {
      label?: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      children?: React.ReactNode;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled} {...props}>
        {label ?? children}
      </button>
    ),
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

async function renderBenchmarkTargetsAndWaitForInitialLoad() {
  render(<BenchmarkTargets />);
  await waitForSelectedCount('2 / 33 selected');
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
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
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
  it('toggles a group on and off and can remove an individual selection', async () => {
    fetchState.urls = [];
    render(<BenchmarkTargets />);
    await waitForSelectedCount('0 / 33 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Quarkus' }));
    await waitForSelectedCount('6 / 33 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Quarkus' }));
    await waitForSelectedCount('0 / 33 selected');
    fireEvent.click(screen.getByRole('button', { name: 'go / virtual' }));
    await waitForSelectedCount('1 / 33 selected');
    fireEvent.click(screen.getByRole('button', { name: 'go / virtual' }));
    await waitForSelectedCount('0 / 33 selected');
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('reloads persisted targets after local selection changes', async () => {
    await renderBenchmarkTargetsAndWaitForInitialLoad();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitForSelectedCount('2 / 33 selected');
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  });

  it('shows a save error when the network rejects the request', async () => {
    await renderBenchmarkTargetsAndWaitForInitialLoad();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('Failed to save benchmark targets')).toBeInTheDocument();
  });

  it.each([true, false])(
    'ignores a stale initial load after effect restart (success=%s)',
    async (success) => {
      let finish!: (response: Response) => void;
      let fail!: (error: Error) => void;
      vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
      );
      render(
        <StrictMode>
          <BenchmarkTargets />
        </StrictMode>,
      );
      await waitForSelectedCount('2 / 33 selected');
      await act(async () => {
        if (success)
          finish(new Response(JSON.stringify({ urls: ['http://go:8080/hello/virtual'] })));
        else fail(new Error('offline'));
      });
      expect(screen.getByText(countMatcher('2 / 33 selected'))).toBeInTheDocument();
      expect(screen.queryByText('Failed to load benchmark targets')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
    },
  );
  beforeEach(() => {
    vi.clearAllMocks();
    fetchState.urls = ['http://quarkus-jvm:8080/hello/platform', 'http://go:8080/hello/virtual'];
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
    await renderBenchmarkTargetsAndWaitForInitialLoad();

    expect(screen.getByText('Benchmark Targets')).toBeInTheDocument();
    expect(screen.getByText(countMatcher('2 / 33 selected'))).toBeInTheDocument();
    expect(screen.getByText('Quick filters (toggle groups)')).toBeInTheDocument();
    expect(screen.getByText('spring')).toBeInTheDocument();
    expect(screen.getAllByText('JVM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Native').length).toBeGreaterThan(0);
    expect(screen.getByText('go')).toBeInTheDocument();
    expect(screen.getByText('django')).toBeInTheDocument();
  });

  it('applies All and None quick filters', async () => {
    await renderBenchmarkTargetsAndWaitForInitialLoad();

    const saveButton = screen.getByRole('button', { name: /^(Saved|Save Changes)$/ });

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitForSelectedCount('33 / 33 selected');
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    await waitForSelectedCount('0 / 33 selected');
  }, 20000);

  it('saves selected targets in canonical endpoint order', async () => {
    fetchState.urls = [];
    render(<BenchmarkTargets />);

    await screen.findByText(countMatcher('0 / 33 selected'));

    fireEvent.click(screen.getByRole('button', { name: 'quarkus-jvm / virtual' }));
    fireEvent.click(screen.getByRole('button', { name: 'spring-jvm-tomcat-platform / platform' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Saved 2 benchmark target(s)')).toBeInTheDocument();
    expect(fetchState.lastPostBody).toEqual({
      urls: [
        'http://spring-jvm-tomcat-platform:8080/hello/platform',
        'http://quarkus-jvm:8080/hello/virtual',
      ],
    });
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();
  }, 20000);

  it('shows an error when reloading or saving fails', async () => {
    await renderBenchmarkTargetsAndWaitForInitialLoad();

    fetchState.getStatus = 500;
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('Failed to load benchmark targets')).toBeInTheDocument();

    fetchState.getStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fetchState.postStatus = 500;
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to save benchmark targets')).toBeInTheDocument();
    });
  }, 10000);
});
