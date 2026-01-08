'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { BootLogger } from './components/BootLogger';
import { createCustomTheme, themeOptions } from './theme';

type DashboardThemeContextValue = {
  currentTheme: string;
  setCurrentTheme: (themeId: string) => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | undefined>(undefined);

export function useDashboardTheme() {
  const ctx = useContext(DashboardThemeContext);
  if (!ctx) {
    throw new Error('useDashboardTheme must be used within <Providers />');
  }
  return ctx;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // Keep the initial theme stable between SSR and the first client render.
  const [currentTheme, setCurrentTheme] = useState<string>('dark');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dashboardTheme');
      // Validate that the stored theme exists in our theme options
      if (stored && themeOptions.some((t) => t.id === stored)) {
        setCurrentTheme(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('dashboardTheme', currentTheme);
    } catch {
      // ignore
    }
  }, [currentTheme]);

  const theme = useMemo(() => createCustomTheme(currentTheme), [currentTheme]);

  const ctxValue = useMemo<DashboardThemeContextValue>(
    () => ({ currentTheme, setCurrentTheme }),
    [currentTheme]
  );

  // Avoid hydration mismatches by not rendering the dynamic client tree until after mount.
  if (!mounted) {
    return (
      <AppRouterCacheProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
        </ThemeProvider>
      </AppRouterCacheProvider>
    );
  }

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BootLogger />
        <DashboardThemeContext.Provider value={ctxValue}>{children}</DashboardThemeContext.Provider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}