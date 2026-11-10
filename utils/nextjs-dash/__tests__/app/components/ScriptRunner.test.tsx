import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@mui/material', async () => {
  const actual = await vi.importActual<typeof import('@mui/material')>('@mui/material');

  type MockTooltipProps = {
    children: React.ReactNode;
  };

  type MockCollapseProps = {
    children: React.ReactNode;
    in?: boolean;
  };

  type MockChipProps = {
    label?: React.ReactNode;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    [key: string]: unknown;
  };

  function MockTooltip({ children }: MockTooltipProps) {
    return <>{children}</>;
  }

  function MockCollapse({ children, in: open }: MockCollapseProps) {
    return open ? <>{children}</> : null;
  }

  function MockChip({ label, icon, children, ...props }: MockChipProps) {
    const domProps = { ...props };
    delete domProps.color;
    delete domProps.size;
    delete domProps.variant;
    delete domProps.sx;

    return (
      <div {...domProps}>
        {icon}
        {label ?? children}
      </div>
    );
  }

  return {
    ...actual,
    Chip: MockChip,
    Collapse: MockCollapse,
    Tooltip: MockTooltip,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────

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

// Mock useScripts
const mockRefresh = vi.fn();
const defaultScriptsReturn = {
  scripts: [
    {
      name: 'Build All',
      description: 'Build all images',
      command: 'docker compose build',
      category: 'build-img' as const,
    },
    {
      name: 'Start OBS',
      description: 'Start observability stack',
      command: 'docker compose up -d',
      category: 'multi-cont' as const,
    },
    {
      name: 'Run Tests',
      description: 'Execute test suite',
      command: 'npm test',
      category: 'test' as const,
    },
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
  ScriptSection: ({
    title,
    scripts,
    onExecuteAction,
    onCopyAction,
    copySuccessFor,
    executeDisabled,
  }: {
    title: string;
    scripts: Array<{ name: string; command: string }>;
    onExecuteAction: (s: { name: string; command: string }) => void;
    onCopyAction: (s: { name: string; command: string }) => void;
    copySuccessFor: string | null;
    executeDisabled?: boolean;
  }) => (
    <div data-testid={`section-${title}`}>
      <h6>{title}</h6>
      {scripts.map((s) => (
        <div key={s.name} data-testid={`script-${s.name}`}>
          <span>{s.name}</span>
          <button onClick={() => onCopyAction(s)}>
            {copySuccessFor === s.name ? `Copied ${s.name}` : `Copy ${s.name}`}
          </button>
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

type ScriptsState = ReturnType<typeof useScripts>;
type JobRunnerState = ReturnType<typeof useJobRunner>;
type EnvValidationState = { loaded: boolean; hostRepoSet: boolean };

function setScriptsState(overrides: Partial<ScriptsState> = {}) {
  vi.mocked(useScripts).mockReturnValue({
    ...defaultScriptsReturn,
    ...overrides,
  });
}

function setJobRunnerState(overrides: Partial<JobRunnerState> = {}) {
  vi.mocked(useJobRunner).mockReturnValue({
    ...defaultJobRunnerReturn,
    ...overrides,
  } as JobRunnerState);
}

function mockEnvValidation(validation?: EnvValidationState) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/env') {
      if (!validation) {
        return new Promise(() => {});
      }

      return new Response(JSON.stringify({ validation }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  });
}

function renderScriptRunner() {
  render(<ScriptRunner />);
}

// ── Setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'setInterval',
    vi.fn(() => 0),
  );
  vi.stubGlobal('clearInterval', vi.fn());

  // Reset mocks to default return values
  setScriptsState();
  setJobRunnerState();
  mockEnvValidation();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('ScriptRunner', () => {
  it('copies a script command and clears its success feedback after two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      renderScriptRunner();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy Build All' }));
      });
      expect(writeText).toHaveBeenCalledWith('docker compose build');
      expect(screen.getByRole('button', { name: 'Copied Build All' })).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('button', { name: 'Copy Build All' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies the active job id through the clipboard boundary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    setJobRunnerState({ currentJobId: 'job-copy' });
    renderScriptRunner();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy job ID' }));
    });
    expect(writeText).toHaveBeenCalledWith('job-copy');
  });

  it.each(['http', 'network'] as const)(
    'blocks execution when environment validation fails with %s error',
    async (failure) => {
      const fetchMock = vi.mocked(fetch);
      if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
      else fetchMock.mockRejectedValueOnce(new Error('offline'));
      renderScriptRunner();
      await waitFor(() => expect(screen.getByTestId('execute-Build All')).toBeDisabled());
      expect(screen.getByRole('button', { name: 'Custom Command' })).toBeDisabled();
      expect(mockRunCommand).not.toHaveBeenCalled();
    },
  );
  it('toggles execution logs and clears their text without resetting the job', () => {
    setJobRunnerState({ currentJobId: 'job-1', eventLogs: ['first', 'latest'] });
    renderScriptRunner();
    expect(screen.queryByText(/first\s+latest/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText(/first\s+latest/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Text' }));
    expect(mockClearEventLogs).toHaveBeenCalledOnce();
    expect(mockReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText(/first\s+latest/)).not.toBeInTheDocument();
  });

  it('keeps a dismissed banner hidden until the job status changes', () => {
    setJobRunnerState({
      currentJobId: 'job-1',
      lastLabel: 'Build',
      lastJobStatus: { jobId: 'job-1', status: 'RUNNING' },
    });
    const view = render(<ScriptRunner />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    view.rerender(<ScriptRunner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    setJobRunnerState({
      currentJobId: 'job-1',
      lastLabel: 'Build',
      lastJobStatus: { jobId: 'job-1', status: 'SUCCEEDED' },
    });
    view.rerender(<ScriptRunner />);
    expect(screen.getByRole('alert')).toHaveTextContent('"Build" completed successfully.');
  });

  it.each(['QUEUED', 'RUNNING'] as const)(
    'prevents another submission while a job is %s',
    (status) => {
      setJobRunnerState({ currentJobId: 'job-1', lastJobStatus: { jobId: 'job-1', status } });
      renderScriptRunner();
      fireEvent.click(screen.getByTestId('execute-Build All'));
      expect(screen.getByTestId('execute-Build All')).toBeDisabled();
      expect(mockRunCommand).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
    },
  );

  it('rejects whitespace commands and clears canceled custom input', () => {
    renderScriptRunner();
    fireEvent.click(screen.getByRole('button', { name: 'Custom Command' }));
    const input = screen.getByPlaceholderText(
      'e.g., docker compose --project-directory compose ps',
    );
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Execute' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom Command' }));
    expect(
      screen.getByPlaceholderText('e.g., docker compose --project-directory compose ps'),
    ).toHaveValue('');
    expect(mockRunCommand).not.toHaveBeenCalled();
  });
  it('shows loading spinner when scripts are loading', () => {
    setScriptsState({ scripts: [], loading: true });

    renderScriptRunner();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders the heading after loading', () => {
    renderScriptRunner();
    expect(screen.getByText('Script Runner')).toBeInTheDocument();
  });

  it('renders script sections by category', () => {
    renderScriptRunner();

    expect(screen.getByTestId('section-Build Images')).toBeInTheDocument();
    expect(screen.getByTestId('section-Tests')).toBeInTheDocument();
  });

  it('renders the Current Execution card', () => {
    renderScriptRunner();
    expect(screen.getByText('Current Execution')).toBeInTheDocument();
  });

  it('executes a script when the execute button is clicked', async () => {
    renderScriptRunner();

    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-Build All'));
    });

    expect(mockReset).toHaveBeenCalled();
    expect(mockRunCommand).toHaveBeenCalledWith('docker compose build', 'Build All');
  });

  it('shows a busy message when the orchestrator rejects a submission', async () => {
    mockRunCommand.mockResolvedValueOnce({
      ok: false,
      output: 'Request failed (HTTP 503)',
      job: null,
    });
    renderScriptRunner();

    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-Build All'));
    });

    expect(screen.getByText('Orchestrator is busy. Try again shortly.')).toBeInTheDocument();
  });

  it('shows Refresh button', () => {
    renderScriptRunner();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  it('calls refresh when Refresh button is clicked', async () => {
    renderScriptRunner();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows Custom Command button', () => {
    renderScriptRunner();
    expect(screen.getByRole('button', { name: /Custom Command/i })).toBeInTheDocument();
  });

  it('toggles free text input when Custom Command is clicked', () => {
    renderScriptRunner();

    fireEvent.click(screen.getByRole('button', { name: /Custom Command/i }));

    expect(screen.getByText('Execute Custom Command')).toBeInTheDocument();
  });

  it('executes a custom command and closes the editor', async () => {
    renderScriptRunner();
    fireEvent.click(screen.getByRole('button', { name: /Custom Command/i }));

    fireEvent.change(
      screen.getByPlaceholderText('e.g., docker compose --project-directory compose ps'),
      { target: { value: 'docker compose ps' } },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Execute$/ }));
    });

    expect(mockRunCommand).toHaveBeenCalledWith('docker compose ps', 'Free Text Command');
    expect(screen.queryByText('Execute Custom Command')).not.toBeInTheDocument();
  });

  it('shows banner message on successful execution', () => {
    setJobRunnerState({
      eventLogs: ['line1', 'line2'],
      currentJobId: 'job-123',
      lastJobStatus: { jobId: 'job-123', status: 'SUCCEEDED' },
      lastCommand: 'docker compose build',
      lastLabel: 'Build All',
    });

    renderScriptRunner();

    expect(screen.getByText(/"Build All" completed successfully\./)).toBeInTheDocument();
  });

  it('shows error banner on failed execution', () => {
    setJobRunnerState({
      currentJobId: 'job-456',
      lastJobStatus: { jobId: 'job-456', status: 'FAILED', exitCode: 1 },
      lastCommand: 'npm test',
      lastLabel: 'Run Tests',
    });

    renderScriptRunner();

    expect(screen.getByText(/"Run Tests" failed.*exitCode=1/)).toBeInTheDocument();
  });

  it('shows status chip with RUNNING state', () => {
    setJobRunnerState({
      executing: true,
      eventLogs: ['starting...'],
      currentJobId: 'job-789',
      lastJobStatus: { jobId: 'job-789', status: 'RUNNING' },
      lastCommand: 'docker compose up',
      lastLabel: 'Start OBS',
      sseConnected: true,
    });

    renderScriptRunner();

    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('shows Execution Logs section when there is execution state', () => {
    setJobRunnerState({
      eventLogs: ['log line 1'],
      currentJobId: 'job-abc',
      lastJobStatus: { jobId: 'job-abc', status: 'SUCCEEDED' },
      lastCommand: 'test',
      lastLabel: 'Test',
    });

    renderScriptRunner();

    expect(screen.getByText('Execution Logs')).toBeInTheDocument();
  });

  it('clears execution state through the job-runner boundary', () => {
    setJobRunnerState({
      eventLogs: ['log line 1'],
      currentJobId: 'job-clear',
      lastJobStatus: { jobId: 'job-clear', status: 'RUNNING' },
      lastCommand: 'test',
      lastLabel: 'Test',
    });
    renderScriptRunner();

    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));

    expect(mockReset).toHaveBeenCalledOnce();
  });

  it('shows "no scripts found" when script list is empty and not loading', () => {
    setScriptsState({ scripts: [] });

    renderScriptRunner();

    expect(screen.getByText(/No scripts found with required prefixes/)).toBeInTheDocument();
  });

  it('shows error alert when useScripts returns an error', () => {
    setScriptsState({
      scripts: [],
      error: 'Failed to load scripts',
    });

    renderScriptRunner();

    expect(screen.getByText('Failed to load scripts')).toBeInTheDocument();
  });

  it('shows reconnect count chip', () => {
    setJobRunnerState({
      eventLogs: ['line'],
      currentJobId: 'job-rc',
      lastJobStatus: { jobId: 'job-rc', status: 'RUNNING' },
      reconnectCount: 3,
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
      sseConnected: true,
    });

    renderScriptRunner();

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows SSE Connected chip in Execution Logs when connected', () => {
    setJobRunnerState({
      executing: true,
      eventLogs: ['starting'],
      currentJobId: 'job-sse',
      lastJobStatus: { jobId: 'job-sse', status: 'RUNNING' },
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
      sseConnected: true,
    });

    renderScriptRunner();

    expect(screen.getByText('SSE Connected')).toBeInTheDocument();
  });

  it('shows SSE Disconnected chip when not connected', () => {
    setJobRunnerState({
      eventLogs: ['done'],
      currentJobId: 'job-disc',
      lastJobStatus: { jobId: 'job-disc', status: 'SUCCEEDED' },
      lastCommand: 'cmd',
      lastLabel: 'Cmd',
    });

    renderScriptRunner();

    expect(screen.getByText('SSE Disconnected')).toBeInTheDocument();
  });

  it('shows CANCELED status', () => {
    setJobRunnerState({
      currentJobId: 'job-cancel',
      lastJobStatus: { jobId: 'job-cancel', status: 'CANCELED' },
      lastCommand: 'cmd',
      lastLabel: 'My Script',
    });

    renderScriptRunner();

    expect(screen.getByText('CANCELED')).toBeInTheDocument();
    expect(screen.getByText(/"My Script" was canceled\./)).toBeInTheDocument();
  });

  it('blocks execution when HOST_REPO is not set', async () => {
    mockEnvValidation({ loaded: true, hostRepoSet: false });

    renderScriptRunner();

    const execBtn = screen.getByTestId('execute-Build All');
    await waitFor(() => {
      expect(execBtn).toBeDisabled();
    });
  });

  it('shows job id chip', () => {
    setJobRunnerState({
      currentJobId: 'abc-def-123',
      lastJobStatus: { jobId: 'abc-def-123', status: 'SUCCEEDED' },
      lastCommand: 'cmd',
      lastLabel: 'Test',
    });

    renderScriptRunner();

    expect(screen.getByText('abc-def-123')).toBeInTheDocument();
  });

  it('shows exit code on finished jobs', () => {
    setJobRunnerState({
      currentJobId: 'job-exit',
      lastJobStatus: { jobId: 'job-exit', status: 'FAILED', exitCode: 137 },
      lastCommand: 'cmd',
      lastLabel: 'Test',
    });

    renderScriptRunner();

    expect(screen.getByText('137')).toBeInTheDocument();
  });
});
