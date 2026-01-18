import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';
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

function mockHealthResponse(services: MockService[], opts?: { serviceActionsEnabled?: Record<string, boolean> }) {
  const enabledDefault = {
    alloy: true,
    grafana: true,
    loki: true,
    mimir: true,
    pyroscope: true,
    tempo: true,

    // everything else off by default; tests can opt-in via overrides
    'spring-jvm-tomcat-platform': false,
    'spring-jvm-tomcat-virtual': false,
    'spring-jvm-netty': false,
    'spring-native-tomcat-platform': false,
    'spring-native-tomcat-virtual': false,
    'spring-native-netty': false,
    'quarkus-jvm': false,
    'quarkus-native': false,
    go: false,
    'nextjs-dash': false,
    orchestrator: false,
    wrk2: false,
  };

  const serviceActionsEnabled = {
    ...enabledDefault,
    ...(opts?.serviceActionsEnabled ?? {}),
  };

  // Update global fetch mock for this test case (used by useServiceActionsConfig).
  const fetchMock = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/service-actions/config') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ enabled: serviceActionsEnabled }),
        text: async () => '',
      } as unknown as Response;
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });

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
        action?: 'start' | 'stop' | 'restart' | 'recreate' | 'delete';
      };
      expect(typeof parsed.service).toBe('string');
      expect(['start', 'stop', 'restart', 'recreate', 'delete']).toContain(parsed.action);

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

beforeEach(() => {
  // Mock global fetch used by useServiceActionsConfig.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/service-actions/config') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            enabled: {
              alloy: true,
              grafana: true,
              loki: true,
              mimir: true,
              pyroscope: true,
              tempo: true,
              'spring-jvm-tomcat-platform': false,
              'spring-jvm-tomcat-virtual': false,
              'spring-jvm-netty': false,
              'spring-native-tomcat-platform': false,
              'spring-native-tomcat-virtual': false,
              'spring-native-netty': false,
              'quarkus-jvm': false,
              'quarkus-native': false,
              go: false,
              'nextjs-dash': false,
              orchestrator: false,
              wrk2: false,
            },
          }),
          text: async () => '',
        } as unknown as Response;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    })
  );

  // Default mock for the fetchJson calls used by ServiceHealth (health + docker control).
  vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/docker/controle') {
      // typo safety
      throw new Error('Unexpected endpoint');
    }

    if (url === '/api/docker/control') {
      expect(init?.method).toBe('POST');
      return { success: true, jobId: 'job-1', command: 'mock', status: 'up' };
    }

    return { services: [] };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServiceHealth', () => {
  it('shows overview counters (UP/DOWN/PENDING/TOTAL)', async () => {
    mockHealthResponse([
      { name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' },
      { name: 'loki', status: 'down', baseUrl: 'http://loki:3100' },
      { name: 'tempo', status: 'pending', baseUrl: 'http://tempo:3200' },
    ]);

    render(<ServiceHealth />);

    expect(await screen.findByText('Overview')).toBeInTheDocument();

    // After the first fetch, it should render a relative string like 'Just now'.
    expect(screen.getByTestId('overview-last-updated')).not.toHaveTextContent('—');

    expect(screen.getByTestId('overview-up')).toHaveTextContent('UP');
    expect(screen.getByTestId('overview-up')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('DOWN');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('TOTAL');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('3');
  });

  it('updates overview counters after Refresh All', async () => {
    const first: MockService[] = [
      { name: 'grafana', status: 'down', baseUrl: 'http://grafana:3000' },
      { name: 'loki', status: 'down', baseUrl: 'http://loki:3100' },
    ];
    const second: MockService[] = [
      { name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' },
      { name: 'loki', status: 'down', baseUrl: 'http://loki:3100' },
    ];

    let healthCalls = 0;

    vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/service-actions/config') {
        // Keep OBS services enabled; other services irrelevant for this test.
        return {
          enabled: {
            alloy: true,
            grafana: true,
            loki: true,
            mimir: true,
            pyroscope: true,
            tempo: true,
            'spring-jvm-tomcat-platform': false,
            'spring-jvm-tomcat-virtual': false,
            'spring-jvm-netty': false,
            'spring-native-tomcat-platform': false,
            'spring-native-tomcat-virtual': false,
            'spring-native-netty': false,
            'quarkus-jvm': false,
            'quarkus-native': false,
            go: false,
            'nextjs-dash': false,
            orchestrator: false,
            wrk2: false,
          },
        };
      }
      if (url.startsWith('/api/health')) {
        healthCalls += 1;
        return { services: healthCalls === 1 ? first : second };
      }
      if (url === '/api/docker/control') {
        return { success: true, jobId: 'job-1', command: 'mock', status: 'up' };
      }
      throw new Error(`Unexpected fetchJson call: ${url}`);
    });

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('Overview')).toBeInTheDocument();

    const initialUpdated = screen.getByTestId('overview-last-updated').textContent;
    expect(initialUpdated).toBeTruthy();
    expect(screen.getByTestId('overview-last-updated')).not.toHaveTextContent('—');

    expect(screen.getByTestId('overview-up')).toHaveTextContent('UP');
    expect(screen.getByTestId('overview-up')).toHaveTextContent('0');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('DOWN');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('2');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('TOTAL');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');

    await user.click(screen.getByRole('button', { name: 'Refresh All' }));

    expect(await screen.findByTestId('overview-up')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');

    // Still should not be placeholder.
    expect(screen.getByTestId('overview-last-updated')).not.toHaveTextContent('—');
  });

  it('updates overview counters after an optimistic action sets a card to PENDING', async () => {
    mockHealthResponse(
      [
        { name: 'wrk2', status: 'down', baseUrl: 'http://wrk2:3000' },
        { name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' },
      ],
      { serviceActionsEnabled: { wrk2: true } }
    );

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('wrk2')).toBeInTheDocument();
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('0');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('DOWN');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('1');

    const wrk2Card = screen.getByText('wrk2').closest('.MuiCard-root') as HTMLElement;
    expect(wrk2Card).toBeTruthy();

    const startBtn = await within(wrk2Card).findByLabelText('Start');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/service-actions/config', expect.anything()));
    await waitFor(() => expect(startBtn).not.toBeDisabled());
    await user.click(startBtn);

    // Optimistic pending affects both card and overview
    expect(await within(wrk2Card).findByText('PENDING')).toBeInTheDocument();
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('0');
  });

  it('shows profile-prefixed command in Delete tooltip for quarkus services', async () => {
    mockHealthResponse([{ name: 'quarkus-jvm', status: 'up', baseUrl: 'http://quarkus-jvm:8080' }], {
      serviceActionsEnabled: { 'quarkus-jvm': true },
    });

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('quarkus-jvm')).toBeInTheDocument();
    const card = screen.getByText('quarkus-jvm').closest('.MuiCard-root') as HTMLElement;
    expect(card).toBeTruthy();

    const deleteBtn = await within(card).findByLabelText('Delete');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/service-actions/config', expect.anything()));
    await waitFor(() => expect(deleteBtn).not.toBeDisabled());
    await user.hover(deleteBtn);

    // Tooltip is rendered in a portal; assert the command text is present.
    expect(
      await screen.findByText('docker compose --profile=OBS --profile=SERVICES rm -f -s quarkus-jvm')
    ).toBeInTheDocument();
  });

  it('shows profile-prefixed command in Delete tooltip for go services', async () => {
    mockHealthResponse([{ name: 'go', status: 'up', baseUrl: 'http://go:8080' }], {
      serviceActionsEnabled: { go: true },
    });

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('go')).toBeInTheDocument();
    const card = screen.getByText('go').closest('.MuiCard-root') as HTMLElement;
    expect(card).toBeTruthy();

    const deleteBtn = await within(card).findByLabelText('Delete');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/service-actions/config', expect.anything()));
    await waitFor(() => expect(deleteBtn).not.toBeDisabled());
    await user.hover(deleteBtn);

    expect(
      await screen.findByText('docker compose --profile=OBS --profile=SERVICES rm -f -s go')
    ).toBeInTheDocument();
  });

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

  it('submits Start and marks service as PENDING', async () => {
    mockHealthResponse([{ name: 'wrk2', status: 'down', baseUrl: 'http://wrk2:3000' }], {
      serviceActionsEnabled: { wrk2: true },
    });

    const user = userEvent.setup();
    render(<ServiceHealth />);

    expect(await screen.findByText('wrk2')).toBeInTheDocument();

    const wrk2Card = screen.getByText('wrk2').closest('.MuiCard-root') as HTMLElement;
    expect(wrk2Card).toBeTruthy();

    const startButton = await within(wrk2Card).findByLabelText('Start');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/service-actions/config', expect.anything()));
    await waitFor(() => expect(startButton).not.toBeDisabled());
    await user.click(startButton);

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/docker/control',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ service: 'wrk2', action: 'start' }),
      })
    );

    // Optimistic pending.
    expect(await within(wrk2Card).findByText('PENDING')).toBeInTheDocument();
  });

  it('submits Restart, Stop and Delete via /api/docker/control with correct intent', async () => {
    const actions: Array<{ label: 'Restart' | 'Stop' | 'Delete'; expectedBody: string }> = [
      { label: 'Restart', expectedBody: JSON.stringify({ service: 'orchestrator', action: 'restart' }) },
      { label: 'Stop', expectedBody: JSON.stringify({ service: 'orchestrator', action: 'stop' }) },
      { label: 'Delete', expectedBody: JSON.stringify({ service: 'orchestrator', action: 'delete' }) },
    ];

    for (const a of actions) {
      vi.mocked(fetchJson).mockClear();
      mockHealthResponse([{ name: 'orchestrator', status: 'up', baseUrl: 'http://orchestrator:3000' }], {
        serviceActionsEnabled: { orchestrator: true },
      });

      const user = userEvent.setup();
      const { unmount } = render(<ServiceHealth />);

      expect(await screen.findByText('orchestrator')).toBeInTheDocument();

      const orchCard = screen.getByText('orchestrator').closest('.MuiCard-root') as HTMLElement;
      expect(orchCard).toBeTruthy();

      const btn = await within(orchCard).findByLabelText(a.label);
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/service-actions/config', expect.anything()));
      await waitFor(() => expect(btn).not.toBeDisabled());
      await user.click(btn);

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

  it('disables actions and shows feature disabled tooltip when feature flag is off', async () => {
    // Explicitly disable actions for go (service-level flag; Refresh remains available).
    mockHealthResponse([{ name: 'go', status: 'up', baseUrl: 'http://go:8080' }], {
      serviceActionsEnabled: { go: false },
    });

    render(<ServiceHealth />);

    expect(await screen.findByText('go')).toBeInTheDocument();

    const goCard = screen.getByText('go').closest('.MuiCard-root') as HTMLElement;
    expect(goCard).toBeTruthy();

    // Refresh is never gated.
    expect(within(goCard).getByLabelText('Refresh')).not.toBeDisabled();

    // These actions should be disabled by feature flags.
    expect(within(goCard).getByLabelText('Stop')).toBeDisabled();
    expect(within(goCard).getByLabelText('Restart')).toBeDisabled();
    expect(within(goCard).getByLabelText('Delete')).toBeDisabled();

    // Tooltip is shown on hover in real UI; in tests, disabled buttons can't be hovered.
    // To still validate the affordance exists, assert the warning icon is rendered.
    expect(within(goCard).getAllByTestId('WarningAmberIcon').length).toBeGreaterThan(0);
  });

  it('renders Base URL as plain text (not a link)', async () => {
    mockHealthResponse([{ name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' }]);

    render(<ServiceHealth />);

    expect(await screen.findByText('grafana')).toBeInTheDocument();

    // Visible as text
    expect(screen.getByText('http://grafana:3000')).toBeInTheDocument();

    // Not rendered as an anchor
    expect(screen.queryByRole('link', { name: 'http://grafana:3000' })).not.toBeInTheDocument();
  });
});
