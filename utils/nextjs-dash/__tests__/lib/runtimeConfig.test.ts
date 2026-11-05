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
          nextjs: '16.4.5',
          react: '19.3.1',
          mui: '9.5.0',
          typescript: '6.0.3',
          platform: 'win32',
          arch: 'x64',
        },
      },
    });

    expect(getRuntimeConfig()).toEqual({
      systemInfo: {
        nodejs: 'v26.13.0',
        npm: '12.2.2',
        nextjs: '16.4.5',
        react: '19.3.1',
        mui: '9.5.0',
        typescript: '6.0.3',
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
