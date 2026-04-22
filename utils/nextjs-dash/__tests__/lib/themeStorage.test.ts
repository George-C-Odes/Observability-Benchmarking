import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockStorage } from '@/__tests__/_helpers/storage';
import { readStoredTheme, writeStoredTheme } from '@/lib/themeStorage';

describe('themeStorage', () => {
  const mockStorage = createMockStorage();

  beforeEach(() => {
    mockStorage.clear();
    vi.stubGlobal('window', { localStorage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a stored valid theme id', () => {
    mockStorage.setItem('dashboardTheme', 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('returns null for an unknown theme id', () => {
    mockStorage.setItem('dashboardTheme', 'unknown-theme');
    expect(readStoredTheme()).toBeNull();
  });

  it('writes the selected theme id and tolerates storage failures', () => {
    writeStoredTheme('cyberpunk');
    expect(mockStorage.getItem('dashboardTheme')).toBe('cyberpunk');

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    expect(() => writeStoredTheme('matrix')).not.toThrow();
  });

  it('returns null when window is unavailable', () => {
    vi.unstubAllGlobals();
    expect(readStoredTheme()).toBeNull();
    expect(() => writeStoredTheme('dark')).not.toThrow();
  });
});

