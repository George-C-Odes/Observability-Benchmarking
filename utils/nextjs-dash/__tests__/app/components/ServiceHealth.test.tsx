import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ServiceHealth calls fetchJson at module scope.
vi.mock('@/lib/fetchJson', () => {
  return {
    fetchJson: vi.fn(),
  };
});

const useServiceActionsConfigMock = vi.hoisted(() => vi.fn());
const useTimedPulseMock = vi.hoisted(() => vi.fn(() => ({ on: false, fire: vi.fn() })));

vi.mock('@/app/hooks/useServiceActionsConfig', () => ({
  useServiceActionsConfig: useServiceActionsConfigMock,
}));

vi.mock('@/app/hooks/useTimedPulse', () => ({
  useTimedPulse: useTimedPulseMock,
}));

import { fetchJson } from '@/lib/fetchJson';
import ServiceHealth from '@/app/components/ServiceHealth';

type MockService = {
  name: string;
  status: 'up' | 'down' | 'pending' | 'UP' | 'DOWN' | 'PENDING';
  baseUrl?: string;
  error?: string;
  body?: unknown;
};

/** Default enabled-flags for service actions (OBS core on, everything else off). */
const SERVICE_ACTIONS_ENABLED_DEFAULT: Record<string, boolean> = {
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

function mockHealthResponse(services: MockService[], opts?: { serviceActionsEnabled?: Record<string, boolean> }) {
  setServiceActionsConfig(opts?.serviceActionsEnabled);

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

function setServiceActionsConfig(overrides?: Record<string, boolean>) {
  useServiceActionsConfigMock.mockReturnValue({
    config: {
      enabled: {
        ...SERVICE_ACTIONS_ENABLED_DEFAULT,
        ...(overrides ?? {}),
      },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
}

async function renderServiceHealth() {
  render(<ServiceHealth />);
  await screen.findByText('Overview');
}

function getServiceCard(name: string) {
  const card = screen.getByText(name).closest('.MuiCard-root');
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  setServiceActionsConfig();
  useTimedPulseMock.mockImplementation(() => ({ on: false, fire: vi.fn() }));

  vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === '/api/docker/control') {
      expect(init?.method).toBe('POST');
      return { success: true, jobId: 'job-1', command: 'mock', status: 'up' };
    }

    return { services: [] };
  });
});

describe('ServiceHealth', () => {
  it('shows overview counters (UP/DOWN/PENDING/TOTAL)', async () => {
    mockHealthResponse([
      { name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' },
      { name: 'loki', status: 'down', baseUrl: 'http://loki:3100' },
      { name: 'tempo', status: 'pending', baseUrl: 'http://tempo:3200' },
    ]);

    await renderServiceHealth();

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
      if (url.startsWith('/api/health')) {
        healthCalls += 1;
        return { services: healthCalls === 1 ? first : second };
      }
      if (url === '/api/docker/control') {
        return { success: true, jobId: 'job-1', command: 'mock', status: 'up' };
      }
      throw new Error(`Unexpected fetchJson call: ${url}`);
    });

    await renderServiceHealth();

    const initialUpdated = screen.getByTestId('overview-last-updated').textContent;
    expect(initialUpdated).toBeTruthy();
    expect(screen.getByTestId('overview-last-updated')).not.toHaveTextContent('—');

    expect(screen.getByTestId('overview-up')).toHaveTextContent('UP');
    expect(screen.getByTestId('overview-up')).toHaveTextContent('0');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('DOWN');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('2');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('TOTAL');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh All' }));

    expect(await screen.findByTestId('overview-up')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-total')).toHaveTextContent('2');

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

    await renderServiceHealth();

    expect(screen.getByText('wrk2')).toBeInTheDocument();
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('0');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('DOWN');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('1');

    const wrk2Card = getServiceCard('wrk2');

    const startBtn = within(wrk2Card).getByLabelText('Start');
    expect(startBtn).not.toBeDisabled();
    fireEvent.click(startBtn);

    expect(await within(wrk2Card).findByText('PENDING')).toBeInTheDocument();
    expect(screen.getByTestId('overview-pending')).toHaveTextContent('1');
    expect(screen.getByTestId('overview-down')).toHaveTextContent('0');
  });

  it('shows profile-prefixed command in Delete tooltip for quarkus services', async () => {
    mockHealthResponse([{ name: 'quarkus-jvm', status: 'up', baseUrl: 'http://quarkus-jvm:8080' }], {
      serviceActionsEnabled: { 'quarkus-jvm': true },
    });

    const user = userEvent.setup();
    await renderServiceHealth();

    expect(screen.getByText('quarkus-jvm')).toBeInTheDocument();
    const card = getServiceCard('quarkus-jvm');

    const deleteBtn = within(card).getByLabelText('Delete');
    expect(deleteBtn).not.toBeDisabled();
    await user.hover(deleteBtn);

    expect(
      await screen.findByText('docker compose --profile=OBS --profile=SERVICES rm -f -s quarkus-jvm')
    ).toBeInTheDocument();
  });

  it('shows profile-prefixed command in Delete tooltip for go services', async () => {
    mockHealthResponse([{ name: 'go', status: 'up', baseUrl: 'http://go:8080' }], {
      serviceActionsEnabled: { go: true },
    });

    const user = userEvent.setup();
    await renderServiceHealth();

    expect(screen.getByText('go')).toBeInTheDocument();
    const card = getServiceCard('go');

    const deleteBtn = within(card).getByLabelText('Delete');
    expect(deleteBtn).not.toBeDisabled();
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
    await screen.findByText('Utils');

    const utilsHeader = screen.getByText('Utils');
    const utilsGrid = utilsHeader.nextElementSibling as HTMLElement;
    expect(utilsGrid).toBeTruthy();

    const cards = Array.from(utilsGrid.querySelectorAll('.MuiCard-root')) as HTMLElement[];
    expect(cards).toHaveLength(3);

    const titles = cards.map((card) => {
      const titleNode = card.querySelector('.MuiCardContent-root .MuiTypography-root');
      return titleNode?.textContent;
    });

    expect(titles).toEqual(['nextjs-dash', 'orchestrator', 'wrk2']);

    expect(container).toBeTruthy();
  });

  it('submits Start and marks service as PENDING', async () => {
    mockHealthResponse([{ name: 'wrk2', status: 'down', baseUrl: 'http://wrk2:3000' }], {
      serviceActionsEnabled: { wrk2: true },
    });

    await renderServiceHealth();

    expect(screen.getByText('wrk2')).toBeInTheDocument();

    const wrk2Card = getServiceCard('wrk2');

    const startButton = within(wrk2Card).getByLabelText('Start');
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    expect(fetchJson).toHaveBeenCalledWith(
      '/api/docker/control',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ service: 'wrk2', action: 'start' }),
      })
    );

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

      const { unmount } = render(<ServiceHealth />);

      expect(await screen.findByText('orchestrator')).toBeInTheDocument();

      const orchCard = getServiceCard('orchestrator');

      const btn = within(orchCard).getByLabelText(a.label);
      expect(btn).not.toBeDisabled();
      fireEvent.click(btn);

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

    await renderServiceHealth();

    expect(screen.getByText('connection refused')).toBeInTheDocument();
    expect(screen.getByText('Response body (hover)')).toBeInTheDocument();

    expect(screen.queryByText(/"details"/)).not.toBeInTheDocument();
  });

  it('disables actions and shows feature disabled tooltip when feature flag is off', async () => {
    mockHealthResponse([{ name: 'go', status: 'up', baseUrl: 'http://go:8080' }], {
      serviceActionsEnabled: { go: false },
    });

    await renderServiceHealth();

    expect(screen.getByText('go')).toBeInTheDocument();

    const goCard = getServiceCard('go');

    expect(within(goCard).getByLabelText('Refresh')).not.toBeDisabled();

    expect(within(goCard).getByLabelText('Stop')).toBeDisabled();
    expect(within(goCard).getByLabelText('Restart')).toBeDisabled();
    expect(within(goCard).getByLabelText('Delete')).toBeDisabled();

    expect(within(goCard).getAllByTestId('WarningAmberIcon').length).toBeGreaterThan(0);
  });

  it('renders Base URL as plain text (not a link)', async () => {
    mockHealthResponse([{ name: 'grafana', status: 'up', baseUrl: 'http://grafana:3000' }]);

    await renderServiceHealth();

    expect(screen.getByText('grafana')).toBeInTheDocument();

    expect(screen.getByText('http://grafana:3000')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'http://grafana:3000' })).not.toBeInTheDocument();
  });
});