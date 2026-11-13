import packageJson from '@/package.json';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeConfig } from '@/lib/runtimeConfig';

describe('runtimeConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty config when window is unavailable', () => {
    expect(getRuntimeConfig()).toEqual({ systemInfo: undefined });
  });

  it('returns systemInfo from the injected window config', () => {
    vi.stubGlobal('window', {
      __OBS_DASH_CONFIG__: {
        systemInfo: {
          nodejs: 'v26.13.0',
          npm: '12.2.2',
          nextjs: packageJson.dependencies.next,
          react: packageJson.dependencies.react,
          mui: packageJson.dependencies['@mui/material'],
          typescript: packageJson.devDependencies.typescript,
          platform: 'win32',
          arch: 'x64',
        },
      },
    });

    expect(getRuntimeConfig()).toEqual({
      systemInfo: {
        nodejs: 'v26.13.0',
        npm: '12.2.2',
        nextjs: packageJson.dependencies.next,
        react: packageJson.dependencies.react,
        mui: packageJson.dependencies['@mui/material'],
        typescript: packageJson.devDependencies.typescript,
        platform: 'win32',
        arch: 'x64',
      },
    });
  });

  it('ignores malformed injected config', () => {
    vi.stubGlobal('window', {
      __OBS_DASH_CONFIG__: {
        systemInfo: 'bad-value',
      },
    });

    expect(getRuntimeConfig()).toEqual({ systemInfo: undefined });
  });
});
