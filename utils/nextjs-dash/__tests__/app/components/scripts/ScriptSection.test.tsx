import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ScriptSection } from '@/app/components/scripts/ScriptSection';

const scripts = [
  {
    name: 'Build All',
    description: 'Build every dashboard image',
    command: 'docker compose build',
    category: 'build-img' as const,
  },
  {
    name: 'Start OBS',
    description: 'Bring up the observability stack',
    command: 'docker compose up -d',
    category: 'multi-cont' as const,
  },
];

describe('ScriptSection', () => {
  it('renders cards and delegates actions for each script', async () => {
    const user = userEvent.setup();
    const onCopyAction = vi.fn();
    const onExecuteAction = vi.fn();

    render(
      <ScriptSection
        title="Build Images"
        scripts={scripts}
        executingName="Start OBS"
        copySuccessFor="Build All"
        accentColor="primary.main"
        chipColor="primary"
        onCopyAction={onCopyAction}
        onExecuteAction={onExecuteAction}
      />,
    );

    expect(screen.getByText('Build Images')).toBeInTheDocument();
    expect(screen.getByText('Build All')).toBeInTheDocument();
    expect(screen.getByText('Start OBS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Executing...' })).toBeInTheDocument();

    const buildAllCard = screen.getByText('Build All').closest('.MuiCard-root');
    expect(buildAllCard).toBeTruthy();

    await user.click(within(buildAllCard as HTMLElement).getByRole('button', { name: /cop/i }));
    await user.click(within(buildAllCard as HTMLElement).getByRole('button', { name: 'Execute' }));

    expect(onCopyAction).toHaveBeenCalledWith(scripts[0]);
    expect(onExecuteAction).toHaveBeenCalledWith(scripts[0]);
  });

  it('returns nothing for an empty section', () => {
    const { container } = render(
      <ScriptSection
        title="Empty"
        scripts={[]}
        executingName={null}
        copySuccessFor={null}
        accentColor="info.main"
        chipColor="info"
        onCopyAction={vi.fn()}
        onExecuteAction={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

