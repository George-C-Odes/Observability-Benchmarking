import { themeOptions } from '@/app/theme';

const STORAGE_KEY = 'dashboardTheme';

type ThemeId = string;

export function readStoredTheme(): ThemeId | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && themeOptions.some((t) => t.id === stored)) {
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function writeStoredTheme(themeId: ThemeId) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // ignore
  }
}

