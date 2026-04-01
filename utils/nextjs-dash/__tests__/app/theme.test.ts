import { describe, expect, it } from 'vitest';

import defaultTheme, { createCustomTheme, themeOptions, type ThemeOption } from '@/app/theme';

// ── themeOptions catalogue ────────────────────────────────────────────

describe('themeOptions', () => {
  it('contains at least one dark and one light theme', () => {
    expect(themeOptions.some((t) => t.mode === 'dark')).toBe(true);
    expect(themeOptions.some((t) => t.mode === 'light')).toBe(true);
  });

  it('has unique ids', () => {
    const ids = themeOptions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each entry has the required fields', () => {
    for (const t of themeOptions) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(['dark', 'light']).toContain(t.mode);
      expect(t.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('lists "dark" as the first entry', () => {
    expect(themeOptions[0].id).toBe('dark');
  });
});

// ── createCustomTheme ─────────────────────────────────────────────────

describe('createCustomTheme', () => {
  it('creates a dark theme for id "dark"', () => {
    const theme = createCustomTheme('dark');
    expect(theme.palette.mode).toBe('dark');
  });

  it('creates a light theme for id "light"', () => {
    const theme = createCustomTheme('light');
    expect(theme.palette.mode).toBe('light');
  });

  it('applies the specified primary and secondary colours', () => {
    const theme = createCustomTheme('cyberpunk');
    const option = themeOptions.find((t) => t.id === 'cyberpunk') as ThemeOption;
    expect(theme.palette.primary.main).toBe(option.primary);
    expect(theme.palette.secondary.main).toBe(option.secondary);
  });

  it('uses the custom background when the theme provides one', () => {
    const option = themeOptions.find((t) => t.id === 'cyberpunk') as ThemeOption;
    const theme = createCustomTheme('cyberpunk');
    expect(theme.palette.background.default).toBe(option.background!.default);
    expect(theme.palette.background.paper).toBe(option.background!.paper);
  });

  it('falls back to default backgrounds for themes without explicit background', () => {
    const dark = createCustomTheme('dark');
    expect(dark.palette.background.default).toBe('#0a1929');
    expect(dark.palette.background.paper).toBe('#132f4c');

    const light = createCustomTheme('light');
    expect(light.palette.background.default).toBe('#ffffff');
    expect(light.palette.background.paper).toBe('#f5f5f5');
  });

  it('falls back to the first theme for an unknown id', () => {
    const fallback = createCustomTheme('nonexistent-id');
    const first = createCustomTheme(themeOptions[0].id);
    expect(fallback.palette.mode).toBe(first.palette.mode);
    expect(fallback.palette.primary.main).toBe(first.palette.primary.main);
  });

  it('sets dark hover shadow for dark themes and light shadow for light themes', () => {
    const darkTheme = createCustomTheme('cyberpunk');
    const darkHover = (darkTheme.components?.MuiCard?.styleOverrides?.root as Record<string, unknown>)?.['&:hover'] as Record<string, string>;
    expect(darkHover.boxShadow).toContain('0.4');

    const lightTheme = createCustomTheme('light');
    const lightHover = (lightTheme.components?.MuiCard?.styleOverrides?.root as Record<string, unknown>)?.['&:hover'] as Record<string, string>;
    expect(lightHover.boxShadow).toContain('0.15');
  });
});

// ── default export ────────────────────────────────────────────────────

describe('default export', () => {
  it('is a dark theme', () => {
    expect(defaultTheme.palette.mode).toBe('dark');
  });
});
