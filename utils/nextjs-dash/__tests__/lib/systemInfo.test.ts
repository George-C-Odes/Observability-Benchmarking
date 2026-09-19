import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractNpmVersionFromPackageManager,
  extractNpmVersionFromUserAgent,
  collectClientSystemInfo,
  resolveServerNpmVersion,
} from '@/lib/systemInfo';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('systemInfo npm version helpers', () => {
  it('extracts npm version from packageManager when pinned', () => {
    expect(extractNpmVersionFromPackageManager('npm@12.0.2')).toBe('12.0.2');
  });

  it('ignores non-npm packageManager values', () => {
    expect(extractNpmVersionFromPackageManager('pnpm@10.8.1')).toBeUndefined();
  });

  it('extracts npm version from npm user agent', () => {
    expect(extractNpmVersionFromUserAgent('npm/12.0.2 node/v26.9.0 linux x64')).toBe('12.0.2');
  });

  it('prefers packageManager over npm user agent for the displayed version', () => {
    expect(
      resolveServerNpmVersion({
        packageManager: 'npm@12.0.2',
        npmUserAgent: 'npm/10.9.3 node/v26.9.0 linux x64',
      }),
    ).toBe('12.0.2');
  });

  it('falls back to N/A when neither source is available', () => {
    expect(resolveServerNpmVersion({})).toBe('N/A');
  });

  it('collects browser details and prefers the user-agent client hint platform', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'ExampleBrowser/1.0',
      language: 'en-GB',
      userAgentData: { platform: 'Windows' },
    });
    vi.stubGlobal('window', {
      screen: { width: 1920, height: 1080 },
      devicePixelRatio: 2,
    });

    expect(collectClientSystemInfo()).toMatchObject({
      userAgent: 'ExampleBrowser/1.0',
      language: 'en-GB',
      platform: 'Windows',
      screen: '1920x1080 @2x',
    });
  });

  it('uses safe display fallbacks when optional browser details are unavailable', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'MinimalBrowser/1.0',
      language: 'en',
    });
    vi.stubGlobal('window', {
      screen: { width: 800, height: 600 },
      devicePixelRatio: 0,
    });

    expect(collectClientSystemInfo()).toMatchObject({
      platform: 'N/A',
      screen: '800x600 @1x',
    });
  });
});
