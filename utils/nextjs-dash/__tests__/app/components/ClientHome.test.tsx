import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMockStorage } from '@/__tests__/_helpers/storage';

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<typeof import('@mui/material')>('@mui/material');

  type MockTabsProps = {
    children?: React.ReactNode;
    value?: number;
    onChange?: (event: React.SyntheticEvent, value: number) => void;
    'aria-label'?: string;
  };

  type MockTabProps = {
    label: React.ReactNode;
    selected?: boolean;
    onSelect?: (event: React.SyntheticEvent) => void;
  };

  return {
    ...actual,
    Tabs: ({ children, value, onChange, 'aria-label': ariaLabel }: MockTabsProps) => (
      <div role="tablist" aria-label={ariaLabel}>
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return child;

          return React.cloneElement(child as React.ReactElement<MockTabProps>, {
            selected: value === index,
            onSelect: (event: React.SyntheticEvent) => onChange?.(event, index),
          });
        })}
      </div>
    ),
    Tab: ({ label, selected, onSelect }: MockTabProps) => (
      <button type="button" role="tab" aria-selected={selected ? 'true' : 'false'} onClick={onSelect}>
        {label}
      </button>
    ),
  };
});

vi.mock('@/app/components/ServiceHealth', () => ({ default: () => <div data-testid="mock-service-health">ServiceHealth</div> }));
vi.mock('@/app/components/ScriptRunner', () => ({ default: () => <div data-testid="mock-script-runner">ScriptRunner</div> }));
vi.mock('@/app/components/EnvEditor', () => ({ default: () => <div data-testid="mock-env-editor">EnvEditor</div> }));
vi.mock('@/app/components/BenchmarkTargets', () => ({ default: () => <div data-testid="mock-benchmark-targets">BenchmarkTargets</div> }));
vi.mock('@/app/components/AppLogs', () => ({ default: () => <div data-testid="mock-app-logs">AppLogs</div> }));
vi.mock('@/app/components/SystemInfo', () => ({ default: () => <div data-testid="mock-system-info">SystemInfo</div> }));
vi.mock('@/app/components/ProjectHub', () => ({ default: () => <div data-testid="mock-project-hub">ProjectHub</div> }));

const mockSetCurrentTheme = vi.fn();
vi.mock('@/app/Providers', () => ({
  useDashboardTheme: () => ({
    currentTheme: 'dark',
    setCurrentTheme: mockSetCurrentTheme,
  }),
}));

import ClientHome from '@/app/components/ClientHome';

const TAB_TEST_IDS = {
  0: 'mock-service-health',
  1: 'mock-script-runner',
  2: 'mock-env-editor',
  3: 'mock-benchmark-targets',
  4: 'mock-app-logs',
  5: 'mock-system-info',
  6: 'mock-project-hub',
} as const;

async function renderClientHomeAndWaitForActiveTab(activeTab: keyof typeof TAB_TEST_IDS = 0) {
  render(<ClientHome />);
  await screen.findByTestId(TAB_TEST_IDS[activeTab]);

  return {
    tabs: {
      serviceHealth: screen.getByRole('tab', { name: 'Service Health' }),
      scriptRunner: screen.getByRole('tab', { name: 'Script Runner' }),
      environmentConfig: screen.getByRole('tab', { name: 'Environment Config' }),
      benchmarkTargets: screen.getByRole('tab', { name: 'Benchmark Targets' }),
      logs: screen.getByRole('tab', { name: 'Logs' }),
      systemInfo: screen.getByRole('tab', { name: 'System Info' }),
      projectHub: screen.getByRole('tab', { name: 'Project Hub' }),
    },
  };
}

async function activateTab(tab: HTMLElement, activeTab: keyof typeof TAB_TEST_IDS) {
  fireEvent.click(tab);
  await screen.findByTestId(TAB_TEST_IDS[activeTab]);
  expect(tab).toHaveAttribute('aria-selected', 'true');
}

// ── localStorage stub ─────────────────────────────────────────────────
// jsdom's localStorage is not always fully functional; use a deterministic stub.
const mockStorage = createMockStorage();

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.clear();
  vi.stubGlobal('localStorage', mockStorage);
  delete document.documentElement.dataset.dashboardTab;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClientHome', () => {
  it('renders the dashboard title', async () => {
    await renderClientHomeAndWaitForActiveTab();
    expect(screen.getByText('Observability Benchmarking Dashboard')).toBeInTheDocument();
  });

  it('renders all seven tab labels', async () => {
    await renderClientHomeAndWaitForActiveTab();
    const tabLabels = [
      'Service Health', 'Script Runner', 'Environment Config',
      'Benchmark Targets', 'Logs', 'System Info', 'Project Hub',
    ];
    for (const label of tabLabels) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('renders the first tab content by default', async () => {
    await renderClientHomeAndWaitForActiveTab();
    expect(screen.getByTestId('mock-service-health')).toBeInTheDocument();
  });

  it('does not render unvisited tab content', async () => {
    await renderClientHomeAndWaitForActiveTab();
    expect(screen.queryByTestId('mock-script-runner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-env-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-project-hub')).not.toBeInTheDocument();
  });

  it('mounts tab content on first visit and keeps it alive', async () => {
    const { tabs } = await renderClientHomeAndWaitForActiveTab();

    await activateTab(tabs.scriptRunner, 1);

    fireEvent.click(tabs.serviceHealth);
    expect(screen.getByTestId('mock-script-runner')).toBeInTheDocument();
  });

  it('saves selected tab to localStorage', async () => {
    const { tabs } = await renderClientHomeAndWaitForActiveTab();

    await activateTab(tabs.logs, 4);
    expect(localStorage.getItem('dashboardTab')).toBe('4');
  });

  it('restores initial tab from localStorage', async () => {
    localStorage.setItem('dashboardTab', '2');
    await renderClientHomeAndWaitForActiveTab(2);

    const envTab = screen.getByRole('tab', { name: 'Environment Config' });
    expect(envTab).toHaveAttribute('aria-selected', 'true');
  });

  it('restores initial tab from data attribute', async () => {
    document.documentElement.dataset.dashboardTab = '3';
    await renderClientHomeAndWaitForActiveTab(3);

    const targetTab = screen.getByRole('tab', { name: 'Benchmark Targets' });
    expect(targetTab).toHaveAttribute('aria-selected', 'true');
  });

  it('prefers data attribute over localStorage for initial tab', async () => {
    localStorage.setItem('dashboardTab', '1');
    document.documentElement.dataset.dashboardTab = '5';
    await renderClientHomeAndWaitForActiveTab(5);

    const systemTab = screen.getByRole('tab', { name: 'System Info' });
    expect(systemTab).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to tab 0 for invalid localStorage value', async () => {
    localStorage.setItem('dashboardTab', 'not-a-number');
    await renderClientHomeAndWaitForActiveTab();

    expect(screen.getByRole('tab', { name: 'Service Health' })).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to tab 0 for invalid data attribute', async () => {
    document.documentElement.dataset.dashboardTab = 'abc';
    await renderClientHomeAndWaitForActiveTab();

    expect(screen.getByRole('tab', { name: 'Service Health' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the theme selector', async () => {
    await renderClientHomeAndWaitForActiveTab();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });

  it('renders active tab panel with correct ARIA attributes', async () => {
    await renderClientHomeAndWaitForActiveTab();

    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('id', 'tabpanel-0');
  });

  it('switches all seven tabs without crashing', async () => {
    const { tabs } = await renderClientHomeAndWaitForActiveTab();

    const tabSequence: Array<[tab: HTMLElement, activeTab: keyof typeof TAB_TEST_IDS]> = [
      [tabs.serviceHealth, 0],
      [tabs.scriptRunner, 1],
      [tabs.environmentConfig, 2],
      [tabs.benchmarkTargets, 3],
      [tabs.logs, 4],
      [tabs.systemInfo, 5],
      [tabs.projectHub, 6],
    ];

    for (const [tab, activeTab] of tabSequence) {
      await activateTab(tab, activeTab);
    }

    expect(screen.getByTestId('mock-service-health')).toBeInTheDocument();
    expect(screen.getByTestId('mock-script-runner')).toBeInTheDocument();
    expect(screen.getByTestId('mock-env-editor')).toBeInTheDocument();
    expect(screen.getByTestId('mock-benchmark-targets')).toBeInTheDocument();
    expect(screen.getByTestId('mock-app-logs')).toBeInTheDocument();
    expect(screen.getByTestId('mock-system-info')).toBeInTheDocument();
    expect(screen.getByTestId('mock-project-hub')).toBeInTheDocument();
  });
});