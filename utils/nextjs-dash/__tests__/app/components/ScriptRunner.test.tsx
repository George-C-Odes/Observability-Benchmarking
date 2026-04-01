import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('@/lib/clientLogger', () => ({
  createClientLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/app/components/ui/InwardPulse', () => ({
  InwardPulse: () => null,
}));

vi.mock('@/app/hooks/useTimedPulse', () => ({
  useTimedPulse: () => ({ on: false, fire: vi.fn() }),
}));

// Mock useScripts
const mockRefresh = vi.fn();
const defaultScriptsReturn = {
  scripts: [
    { name: 'Build All', description: 'Build all images', command: 'docker compose build', category: 'build-img' as const },
    { name: 'Start OBS', description: 'Start observability stack', command: 'docker compose up -d', category: 'multi-cont' as const },
    { name: 'Run Tests', description: 'Execute test suite', command: 'npm test', category: 'test' as const },
  ],
  loading: false,
  error: null,
  refresh: mockRefresh,
};

vi.mock('@/app/hooks/useScripts', () => ({
  useScripts: vi.fn(() => defaultScriptsReturn),
}));

// Mock useJobRunner
const mockRunCommand = vi.fn().mockResolvedValue({ ok: true, output: '', job: null });
const mockReset = vi.fn();
const mockClearEventLogs = vi.fn();
const defaultJobRunnerReturn = {
  executing: false,
  eventLogs: [] as string[],
  clearEventLogs: mockClearEventLogs,
  reset: mockReset,
  runCommand: mockRunCommand,
  currentJobId: null,
  lastJobStatus: null,
  reconnectCount: 0,
  lastCommand: null,
  lastLabel: null,
  sseConnected: false,
  sseLastError: null,
  maxExecutionLogLines: 500,
};

vi.mock('@/app/hooks/useJobRunner', () => ({
  useJobRunner: vi.fn(() => defaultJobRunnerReturn),
}));

// Mock ScriptSection to simplify rendering
vi.mock('@/app/components/scripts/ScriptSection', () => ({
  ScriptSection: ({ title, scripts, onExecuteAction, executeDisabled }: {
    title: string;
    scripts: Array<{ name: string; command: string }>;
    onExecuteAction: (s: { name: string; command: string }) => void;
    executeDisabled?: boolean;
  }) => (
    <div data-testid={`section-${title}`}>
      <h6>{title}</h6>
      {scripts.map((s) => (
        <div key={s.name} data-testid={`script-${s.name}`}>
          <span>{s.name}</span>
          <button
            data-testid={`execute-${s.name}`}
            onClick={() => onExecuteAction(s)}
            disabled={executeDisabled}
          >
            Execute {s.name}
          </button>
        </div>
      ))}
    </div>
  ),
}));

import ScriptRunner from '@/app/components/ScriptRunner';
import { useScripts } from '@/app/hooks/useScripts';
import { useJobRunner } from '@/app/hooks/useJobRunner';

// ── Setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Reset mocks to default return values
  vi.mocked(useScripts).mockReturnValue(defaultScriptsReturn);
  vi.mocked(useJobRunner).mockReturnValue(defaultJobRunnerReturn as ReturnType<typeof useJobRunner>);

  // Mock fetch for the env validation call
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/env') {
      return new Response(
        JSON.stringify({ validation: { loaded: true, hostRepoSet: true } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not found', { status: 404 });
  });

});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('ScriptRunner', () => {
  it('shows loading spinner when scripts are loading', () => {
    vi.mocked(useScripts).mockReturnValue({
      ...defaultScriptsReturn,
      scripts: [],
      loading: true,
    });

    render(<ScriptRunner />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the heading after loading', async () => {
    render(<ScriptRunner />);
    expect(await screen.findByText('Script Runner')).toBeInTheDocument();
  });

  it('renders script sections by category', async () => {
    render(<ScriptRunner />);

    await waitFor(() => {
      expect(screen.getByTestId('section-Build Images')).toBeInTheDocument();
    });

    expect(screen.getByTestId('section-Tests')).toBeInTheDocument();
  });

  it('renders the Current Execution card', async () => {
    render(<ScriptRunner />);
    expect(await screen.findByText('Current Execution')).toBeInTheDocument();
  });

  it('executes a script when the execute button is clicked', async () => {
    const user = userEvent.setup();
    render(<ScriptRunner />);

    await waitFor(() => {
      expect(screen.getByTestId('execute-Build All')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('execute-Build All'));

    expect(mockReset).toHaveBeenCalled();
    expect(mockRunCommand).toHaveBeenCalledWith('docker compose build', 'Build All');
  });

  it('shows Refresh button', async () => {
    render(<ScriptRunner />);
    expect(await screen.findByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  it('calls refresh when Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<ScriptRunner />);

    await user.click(await screen.findByRole('button', { name: /Refresh/i }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows Custom Command button', async () => {
    render(<ScriptRunner />);
    expect(await screen.findByRole('button', { name: /Custom Command/i })).toBeInTheDocument();
  });

  it('toggles free text input when Custom Command is clicked', async () => {
    const user = userEvent.setup();
    render(<ScriptRunner />);

    const customBtn = await screen.findByRole('button', { name: /Custom Command/i });
    await user.click(customBtn);

    expect(screen.getByText('Execute Custom Command')).toBeInTheDocument();
  });

  it('shows banner message on successful execution', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      eventLogs: ['line1', 'line2'],
      currentJobId: 'job-123',
      lastJobStatus: { jobId: 'job-123', status: 'SUCCEEDED' },
      lastCommand: 'docker compose build',
      lastLabel: 'Build All',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText(/"Build All" completed successfully\./)).toBeInTheDocument();
  });

  it('shows error banner on failed execution', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      currentJobId: 'job-456',
      lastJobStatus: { jobId: 'job-456', status: 'FAILED', exitCode: 1 },
      lastCommand: 'npm test',
      lastLabel: 'Run Tests',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText(/"Run Tests" failed.*exitCode=1/)).toBeInTheDocument();
  });

  it('shows status chip with RUNNING state', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      executing: true,
      eventLogs: ['starting...'],
      currentJobId: 'job-789',
      lastJobStatus: { jobId: 'job-789', status: 'RUNNING' },
      lastCommand: 'docker compose up',
      lastLabel: 'Start OBS',
      sseConnected: true,
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('RUNNING')).toBeInTheDocument();
  });

  it('shows Execution Logs section when there is execution state', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      eventLogs: ['log line 1'],
      currentJobId: 'job-abc',
      lastJobStatus: { jobId: 'job-abc', status: 'SUCCEEDED' },
      lastCommand: 'test',
      lastLabel: 'Test',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('Execution Logs')).toBeInTheDocument();
  });

  it('shows "no scripts found" when script list is empty and not loading', async () => {
    vi.mocked(useScripts).mockReturnValue({
      ...defaultScriptsReturn,
      scripts: [],
    });

    render(<ScriptRunner />);

    expect(
      await screen.findByText(/No scripts found with required prefixes/),
    ).toBeInTheDocument();
  });

  it('shows error alert when useScripts returns an error', async () => {
    vi.mocked(useScripts).mockReturnValue({
      ...defaultScriptsReturn,
      scripts: [],
      error: 'Failed to load scripts',
    });

    render(<ScriptRunner />);

    expect(await screen.findByText('Failed to load scripts')).toBeInTheDocument();
  });

  it('shows reconnect count chip', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      eventLogs: ['line'],
      currentJobId: 'job-rc',
      lastJobStatus: { jobId: 'job-rc', status: 'RUNNING' },
      reconnectCount: 3,
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
      sseConnected: true,
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('shows SSE Connected chip in Execution Logs when connected', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      executing: true,
      eventLogs: ['starting'],
      currentJobId: 'job-sse',
      lastJobStatus: { jobId: 'job-sse', status: 'RUNNING' },
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
      sseConnected: true,
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('SSE Connected')).toBeInTheDocument();
  });

  it('shows SSE Disconnected chip when not connected', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      eventLogs: ['done'],
      currentJobId: 'job-disc',
      lastJobStatus: { jobId: 'job-disc', status: 'SUCCEEDED' },
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('SSE Disconnected')).toBeInTheDocument();
  });

  it('shows CANCELED status', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      currentJobId: 'job-cancel',
      lastJobStatus: { jobId: 'job-cancel', status: 'CANCELED' },
      lastCommand: 'cmd',
      lastLabel: 'My Script',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('CANCELED')).toBeInTheDocument();
    expect(await screen.findByText(/"My Script" was canceled\./)).toBeInTheDocument();
  });

  it('blocks execution when HOST_REPO is not set', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/env') {
        return new Response(
          JSON.stringify({ validation: { loaded: true, hostRepoSet: false } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    render(<ScriptRunner />);

    await waitFor(() => {
      const execBtn = screen.getByTestId('execute-Build All');
      expect(execBtn).toBeDisabled();
    });
  });

  it('shows job id chip', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      currentJobId: 'abc-def-123',
      lastJobStatus: { jobId: 'abc-def-123', status: 'SUCCEEDED' },
      lastCommand: 'cmd',
      lastLabel: 'Test',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('abc-def-123')).toBeInTheDocument();
  });

  it('shows exit code on finished jobs', async () => {
    vi.mocked(useJobRunner).mockReturnValue({
      ...defaultJobRunnerReturn,
      currentJobId: 'job-exit',
      lastJobStatus: { jobId: 'job-exit', status: 'FAILED', exitCode: 137 },
      lastCommand: 'cmd',
      lastLabel: 'Test',
    } as ReturnType<typeof useJobRunner>);

    render(<ScriptRunner />);

    expect(await screen.findByText('137')).toBeInTheDocument();
  });
});