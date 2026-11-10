import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExecutionLogs } from '@/app/components/scripts/ExecutionLogs';

function props() {
  return {
    sseConnected: false,
    showStreamIssueChip: false,
    reconnectCount: 0,
    showEventLogs: true,
    statusPulseOn: false,
    maxExecutionLogLines: 500,
    eventLogs: ['starting', 'finished'],
    executionLogRef: React.createRef<HTMLDivElement>(),
    clearEventLogs: vi.fn(),
    onReset: vi.fn(),
    onToggle: vi.fn(),
  };
}

describe('ExecutionLogs', () => {
  it('renders ordered output and keeps clearing text separate from resetting the job', () => {
    const input = props();
    render(<ExecutionLogs {...input} />);
    expect(input.executionLogRef.current?.textContent).toBe('starting\nfinished');
    expect(screen.getByText('2 lines')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Text' }));
    expect(input.clearEventLogs).toHaveBeenCalledOnce();
    expect(input.onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Reset execution state/ }));
    expect(input.onReset).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Hide execution logs' }));
    expect(input.onToggle).toHaveBeenCalledOnce();
  });

  it('shows empty output, connection changes, and stream issue counts', () => {
    const input = { ...props(), eventLogs: [], showStreamIssueChip: true };
    const { rerender } = render(<ExecutionLogs {...input} />);
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.getByText('0 lines')).toBeInTheDocument();
    expect(screen.getByText('SSE Disconnected')).toBeInTheDocument();
    expect(screen.getByText('Stream issue')).toBeInTheDocument();
    rerender(<ExecutionLogs {...input} reconnectCount={3} showEventLogs={false} />);
    expect(screen.getByText('Stream issue (3)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show execution logs' }));
    expect(input.onToggle).toHaveBeenCalledOnce();
    rerender(<ExecutionLogs {...input} sseConnected showStreamIssueChip={false} />);
    expect(screen.getByText('SSE Connected')).toBeInTheDocument();
    expect(screen.queryByText(/Stream issue/)).not.toBeInTheDocument();
  });
});
