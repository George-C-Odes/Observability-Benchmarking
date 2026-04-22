import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScriptCard } from '@/app/components/scripts/ScriptCard';

const script = {
  name: 'Build All',
  description: 'Build every dashboard image',
  command: 'docker compose build',
  category: 'build-img' as const,
};

describe('ScriptCard', () => {
  it('renders script details and fires actions', async () => {
    const user = userEvent.setup();
    const onCopyAction = vi.fn();
    const onExecuteAction = vi.fn();

    render(
      <ScriptCard
        script={script}
        executing={false}
        accentColor="primary.main"
        chipColor="primary"
        copySuccess={false}
        onCopyAction={onCopyAction}
        onExecuteAction={onExecuteAction}
      />,
    );

    expect(screen.getByText('Build All')).toBeInTheDocument();
    expect(screen.getByText('Build every dashboard image')).toBeInTheDocument();
    expect(screen.getByText('docker')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy command/i }));
    await user.click(screen.getByRole('button', { name: 'Execute' }));

    expect(onCopyAction).toHaveBeenCalledOnce();
    expect(onExecuteAction).toHaveBeenCalledOnce();
  });

  it('shows executing state and respects disablement', () => {
    render(
      <ScriptCard
        script={script}
        executing
        executeDisabled
        executeDisabledReason="Busy"
        accentColor="success.main"
        chipColor="success"
        copySuccess
        onCopyAction={vi.fn()}
        onExecuteAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Executing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
  });
});

