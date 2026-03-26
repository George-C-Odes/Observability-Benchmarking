import { describe, expect, it } from 'vitest';

import {
  extractNpmVersionFromPackageManager,
  extractNpmVersionFromUserAgent,
  resolveServerNpmVersion,
} from './systemInfo';

describe('systemInfo npm version helpers', () => {
  it('extracts npm version from packageManager when pinned', () => {
    expect(extractNpmVersionFromPackageManager('npm@11.12.0')).toBe('11.12.0');
  });

  it('ignores non-npm packageManager values', () => {
    expect(extractNpmVersionFromPackageManager('pnpm@10.8.1')).toBeUndefined();
  });

  it('extracts npm version from npm user agent', () => {
    expect(extractNpmVersionFromUserAgent('npm/11.12.0 node/v25.8.2 linux x64')).toBe('11.12.0');
  });

  it('prefers packageManager over npm user agent for the displayed version', () => {
    expect(resolveServerNpmVersion({
      packageManager: 'npm@11.12.0',
      npmUserAgent: 'npm/10.9.3 node/v25.8.2 linux x64',
    })).toBe('11.12.0');
  });

  it('falls back to N/A when neither source is available', () => {
    expect(resolveServerNpmVersion({})).toBe('N/A');
  });
});
