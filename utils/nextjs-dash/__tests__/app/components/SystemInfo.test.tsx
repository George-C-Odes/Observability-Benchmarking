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
        nodejs: 'v26.13.0',
        npm: '12.2.1',
        nextjs: '16.4.3',
        react: '19.3.1',
        mui: '9.5.0',
        typescript: '6.0.3',
        platform: 'linux',
        arch: 'x64',
      },
    };

    render(<SystemInfo />);

    const npmLabel = screen.getByText('npm');
    const npmCard = npmLabel.closest('.MuiCard-root');

    expect(npmCard).toBeTruthy();
    expect(within(npmCard as HTMLElement).getByText('12.2.1')).toBeInTheDocument();
    expect(
      screen.queryByText('Server system information is not available.'),
    ).not.toBeInTheDocument();
  });
});
