import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import SystemInfo from '@/app/components/SystemInfo';

afterEach(() => {
  delete window.__OBS_DASH_CONFIG__;
  cleanup();
});

describe('SystemInfo', () => {
  it('renders the injected server npm version in the npm card', () => {
    window.__OBS_DASH_CONFIG__ = {
      systemInfo: {
        nodejs: 'v26.5.1',
        npm: '12.0.2',
        nextjs: '16.2.12',
        react: '19.2.8',
        mui: '9.2.0',
        typescript: '6.0.3',
        platform: 'linux',
        arch: 'x64',
      },
    };

    render(<SystemInfo />);

    const npmLabel = screen.getByText('npm');
    const npmCard = npmLabel.closest('.MuiCard-root');

    expect(npmCard).toBeTruthy();
    expect(within(npmCard as HTMLElement).getByText('12.0.2')).toBeInTheDocument();
    expect(screen.queryByText('Server system information is not available.')).not.toBeInTheDocument();
  });
});