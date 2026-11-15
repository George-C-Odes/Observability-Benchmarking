import packageJson from '@/package.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import SystemInfo from '@/app/components/SystemInfo';
import * as systemInfo from '@/lib/systemInfo';

afterEach(() => {
  vi.restoreAllMocks();
  delete window.__OBS_DASH_CONFIG__;
  cleanup();
});

describe('SystemInfo', () => {
  it('warns when server information is missing', () => {
    render(<SystemInfo />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Server system information is not available.',
    );
  });

  it('keeps server cards visible if collecting client information fails', () => {
    window.__OBS_DASH_CONFIG__ = {
      systemInfo: {
        nodejs: 'v26',
        npm: '12',
        nextjs: '16',
        react: '19',
        mui: '9',
        typescript: '7',
        platform: 'linux',
        arch: 'x64',
      },
    };
    vi.spyOn(systemInfo, 'collectClientSystemInfo').mockImplementation(() => {
      throw new Error('unavailable');
    });
    render(<SystemInfo />);
    expect(screen.getByText('Collecting client info…')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });
  it('renders the injected server npm version in the npm card', () => {
    window.__OBS_DASH_CONFIG__ = {
      systemInfo: {
        nodejs: 'v26.13.1',
        npm: '12.2.2',
        nextjs: packageJson.dependencies.next,
        react: packageJson.dependencies.react,
        mui: packageJson.dependencies['@mui/material'],
        typescript: packageJson.devDependencies.typescript,
        platform: 'linux',
        arch: 'x64',
      },
    };

    render(<SystemInfo />);

    const npmLabel = screen.getByText('npm');
    const npmCard = npmLabel.closest('.MuiCard-root');

    expect(npmCard).toBeTruthy();
    expect(within(npmCard as HTMLElement).getByText('12.2.2')).toBeInTheDocument();
    expect(
      screen.queryByText('Server system information is not available.'),
    ).not.toBeInTheDocument();
  });
});
