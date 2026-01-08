'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { BootLogger } from './components/BootLogger';
import { createCustomTheme, themeOptions } from './theme';
import { installConsoleCapture } from '@/lib/clientLogs';
import { readStoredTheme, writeStoredTheme } from '@/lib/themeStorage';

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

function sanitizeThemeId(themeId: string | null | undefined): string {
  if (!themeId) return 'dark';
  return themeOptions.some((t) => t.id === themeId) ? themeId : 'dark';
}

function getInitialTheme(): string {
  // SSR fallback
  if (typeof window === 'undefined') return 'dark';

  // Prefer the pre-hydration value injected by ThemeHydrationScript.
  const attr = document.documentElement.dataset.dashboardTheme;
  if (attr) return sanitizeThemeId(attr);

  return sanitizeThemeId(readStoredTheme() ?? 'dark');
}

export default function Providers({ children }: { children: ReactNode }) {
  const [currentTheme, _setCurrentTheme] = useState<string>(getInitialTheme);

  const setCurrentTheme = (themeId: string) => {
    _setCurrentTheme(sanitizeThemeId(themeId));
  };

  useEffect(() => {
    installConsoleCapture();
  }, []);

  useEffect(() => {

    writeStoredTheme(currentTheme);
    // Keep the data attribute in sync (useful for debugging and future CSS hooks).
    document.documentElement.dataset.dashboardTheme = currentTheme;
  }, [currentTheme]);

  const theme = useMemo(() => createCustomTheme(currentTheme), [currentTheme]);

  const ctxValue = useMemo<DashboardThemeContextValue>(
    () => ({ currentTheme, setCurrentTheme }),
    [currentTheme]
  );


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