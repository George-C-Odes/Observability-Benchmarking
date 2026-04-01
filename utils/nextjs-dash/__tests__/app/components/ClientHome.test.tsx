import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Module mocks ──────────────────────────────────────────────────────

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

// ── localStorage stub ─────────────────────────────────────────────────
// jsdom's localStorage is not always fully functional; use a simple stub.
let storageMap: Record<string, string> = {};
const mockStorage: Storage = {
  getItem: (key: string) => storageMap[key] ?? null,
  setItem: (key: string, value: string) => { storageMap[key] = value; },
  removeItem: (key: string) => { delete storageMap[key]; },
  clear: () => { storageMap = {}; },
  key: (index: number) => Object.keys(storageMap)[index] ?? null,
  get length() { return Object.keys(storageMap).length; },
};

beforeEach(() => {
  vi.clearAllMocks();
  storageMap = {};
  vi.stubGlobal('localStorage', mockStorage);
  delete document.documentElement.dataset.dashboardTab;
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ClientHome', () => {
  it('renders the dashboard title', () => {
    render(<ClientHome />);
    expect(screen.getByText('Observability Benchmarking Dashboard')).toBeInTheDocument();
  });

  it('renders all seven tab labels', () => {
    render(<ClientHome />);
    const tabLabels = [
      'Service Health', 'Script Runner', 'Environment Config',
      'Benchmark Targets', 'Logs', 'System Info', 'Project Hub',
    ];
    for (const label of tabLabels) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('renders the first tab content by default', async () => {
    render(<ClientHome />);
    expect(await screen.findByTestId('mock-service-health')).toBeInTheDocument();
  });

  it('does not render unvisited tab content', () => {
    render(<ClientHome />);
    expect(screen.queryByTestId('mock-script-runner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-env-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-project-hub')).not.toBeInTheDocument();
  });

  it('mounts tab content on first visit and keeps it alive', async () => {
    const user = userEvent.setup();
    render(<ClientHome />);

    await user.click(screen.getByRole('tab', { name: 'Script Runner' }));
    expect(await screen.findByTestId('mock-script-runner')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Service Health' }));
    expect(screen.getByTestId('mock-script-runner')).toBeInTheDocument();
  });

  it('saves selected tab to localStorage', async () => {
    const user = userEvent.setup();
    render(<ClientHome />);

    await user.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(localStorage.getItem('dashboardTab')).toBe('4');
  });

  it('restores initial tab from localStorage', () => {
    localStorage.setItem('dashboardTab', '2');
    render(<ClientHome />);

    const envTab = screen.getByRole('tab', { name: 'Environment Config' });
    expect(envTab).toHaveAttribute('aria-selected', 'true');
  });

  it('restores initial tab from data attribute', () => {
    document.documentElement.dataset.dashboardTab = '3';
    render(<ClientHome />);

    const targetTab = screen.getByRole('tab', { name: 'Benchmark Targets' });
    expect(targetTab).toHaveAttribute('aria-selected', 'true');
  });

  it('prefers data attribute over localStorage for initial tab', () => {
    localStorage.setItem('dashboardTab', '1');
    document.documentElement.dataset.dashboardTab = '5';
    render(<ClientHome />);

    const systemTab = screen.getByRole('tab', { name: 'System Info' });
    expect(systemTab).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to tab 0 for invalid localStorage value', () => {
    localStorage.setItem('dashboardTab', 'not-a-number');
    render(<ClientHome />);

    expect(screen.getByRole('tab', { name: 'Service Health' })).toHaveAttribute('aria-selected', 'true');
  });

  it('defaults to tab 0 for invalid data attribute', () => {
    document.documentElement.dataset.dashboardTab = 'abc';
    render(<ClientHome />);

    expect(screen.getByRole('tab', { name: 'Service Health' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the theme selector', () => {
    render(<ClientHome />);
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });

  it('renders active tab panel with correct ARIA attributes', async () => {
    render(<ClientHome />);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('id', 'tabpanel-0');
  });

  it('switches all seven tabs without crashing', async () => {
    const user = userEvent.setup();
    render(<ClientHome />);

    const tabNames = [
      'Service Health', 'Script Runner', 'Environment Config',
      'Benchmark Targets', 'Logs', 'System Info', 'Project Hub',
    ];

    for (const name of tabNames) {
      await user.click(screen.getByRole('tab', { name }));
      // Wait for lazy component to mount
      await waitFor(() => {
        const tab = screen.getByRole('tab', { name });
        expect(tab).toHaveAttribute('aria-selected', 'true');
      });
    }

    // All visited panels should be in the document
    await waitFor(() => {
      expect(screen.getByTestId('mock-service-health')).toBeInTheDocument();
      expect(screen.getByTestId('mock-script-runner')).toBeInTheDocument();
      expect(screen.getByTestId('mock-env-editor')).toBeInTheDocument();
      expect(screen.getByTestId('mock-benchmark-targets')).toBeInTheDocument();
      expect(screen.getByTestId('mock-app-logs')).toBeInTheDocument();
      expect(screen.getByTestId('mock-system-info')).toBeInTheDocument();
      expect(screen.getByTestId('mock-project-hub')).toBeInTheDocument();
    });
  });
});