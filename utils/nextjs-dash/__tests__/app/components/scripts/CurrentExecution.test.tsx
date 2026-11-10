import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CurrentExecution } from '@/app/components/scripts/CurrentExecution';
import type { JobStatus } from '@/app/hooks/useJobRunner';

const start = '2026-01-01T00:00:00Z';
function props(): React.ComponentProps<typeof CurrentExecution> {
  return {
    lastJobStatus: null,
    runtimeNowMs: Date.parse(start),
    eventLogs: [],
    terminalPulseOn: false,
    statusPulseOn: false,
    sseConnected: false,
    currentJobId: null,
    isTerminal: false,
    sseLastError: null,
    reconnectCount: 0,
    jobCommandText: '',
    jobTitleText: 'Build images',
    copyText: vi.fn().mockResolvedValue(undefined),
    isRunning: false,
  };
}

describe('CurrentExecution', () => {
  it.each<JobStatus['status']>(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'])(
    'renders %s and the recorded exit code and output',
    (status) => {
      render(
        <CurrentExecution
          {...props()}
          lastJobStatus={{ jobId: 'job-1', status, exitCode: 137, lastLine: 'recorded output' }}
          eventLogs={['older output']}
        />,
      );
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getByText('137')).toBeInTheDocument();
      expect(screen.getByText('recorded output')).toBeInTheDocument();
      expect(screen.queryByText('older output')).not.toBeInTheDocument();
    },
  );

  it.each([
    [2_999, '2s'],
    [65_000, '1m 5s'],
    [3_661_000, '1h 1m 1s'],
    [-1000, '0s'],
  ])('shows elapsed runtime for %i ms and freezes at finish time', (elapsed, expected) => {
    const input = props();
    const job: JobStatus = { jobId: 'job-1', status: 'RUNNING', createdAt: start };
    const { rerender } = render(
      <CurrentExecution
        {...input}
        lastJobStatus={job}
        isRunning
        runtimeNowMs={Date.parse(start) + elapsed}
      />,
    );
    expect(screen.getByText(`running… ${expected}`)).toBeInTheDocument();
    rerender(
      <CurrentExecution
        {...input}
        lastJobStatus={{
          ...job,
          status: 'SUCCEEDED',
          finishedAt: new Date(Date.parse(start) + elapsed).toISOString(),
        }}
        runtimeNowMs={Date.parse(start) + 99_000_000}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/running…/)).not.toBeInTheDocument();
  });

  it('handles missing and invalid timestamps and uses the latest streamed line', () => {
    const input = props();
    const { rerender } = render(<CurrentExecution {...input} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByText('stream')).not.toBeInTheDocument();
    rerender(
      <CurrentExecution
        {...input}
        isRunning
        eventLogs={['old', 'latest']}
        lastJobStatus={{ jobId: 'job-1', status: 'RUNNING', startedAt: 'invalid' }}
      />,
    );
    expect(screen.getByText('running… —')).toBeInTheDocument();
    expect(screen.getByText('latest')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
  });

  it('shows stream warnings only for an active disconnected job and copies its id and command', async () => {
    const input = { ...props(), currentJobId: 'job-1', jobCommandText: 'docker compose build' };
    const { rerender } = render(<CurrentExecution {...input} />);
    expect(screen.getByText('stream')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(input.copyText).toHaveBeenCalledWith('job-1');
    fireEvent.mouseOver(screen.getByText('Build images'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(input.copyText).toHaveBeenCalledWith('docker compose build');
    rerender(<CurrentExecution {...input} sseConnected />);
    expect(screen.queryByText('stream')).not.toBeInTheDocument();
    rerender(<CurrentExecution {...input} isTerminal />);
    expect(screen.queryByText('stream')).not.toBeInTheDocument();
  });
});
