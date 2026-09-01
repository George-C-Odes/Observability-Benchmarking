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
          nodejs: 'v26.8.1',
          npm: '12.0.2',
          nextjs: '16.3.4',
          react: '19.2.8',
          mui: '9.4.0',
          typescript: '6.0.3',
          platform: 'win32',
          arch: 'x64',
        },
      },
    });

    expect(getRuntimeConfig()).toEqual({
      systemInfo: {
        nodejs: 'v26.8.1',
        npm: '12.0.2',
        nextjs: '16.3.4',
        react: '19.2.8',
        mui: '9.4.0',
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

