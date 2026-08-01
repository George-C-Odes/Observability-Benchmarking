import { describe, expect, it } from 'vitest';

import {
  extractNpmVersionFromPackageManager,
  extractNpmVersionFromUserAgent,
  resolveServerNpmVersion,
} from '@/lib/systemInfo';

describe('systemInfo npm version helpers', () => {
  it('extracts npm version from packageManager when pinned', () => {
    expect(extractNpmVersionFromPackageManager('npm@12.0.2')).toBe('12.0.2');
  });

  it('ignores non-npm packageManager values', () => {
    expect(extractNpmVersionFromPackageManager('pnpm@10.8.1')).toBeUndefined();
  });

  it('extracts npm version from npm user agent', () => {
    expect(extractNpmVersionFromUserAgent('npm/12.0.2 node/v26.5.1 linux x64')).toBe('12.0.2');
  });

  it('prefers packageManager over npm user agent for the displayed version', () => {
    expect(resolveServerNpmVersion({
      packageManager: 'npm@12.0.2',
      npmUserAgent: 'npm/10.9.3 node/v26.5.1 linux x64',
    })).toBe('12.0.2');
  });

  it('falls back to N/A when neither source is available', () => {
    expect(resolveServerNpmVersion({})).toBe('N/A');
  });
});