'use client';

import React, { lazy, Suspense, useState, useCallback, useSyncExternalStore } from 'react';
import {
  Box,
  Container,
  Typography,
  AppBar,
  Toolbar,
  Tabs,
  Tab,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import DashboardIcon from '@mui/icons-material/Dashboard';

// Lazy-load heavy tab content so only the active tab's JS bundle is downloaded on demand.
const ServiceHealth = lazy(() => import('./ServiceHealth'));
const ScriptRunner = lazy(() => import('./ScriptRunner'));
const EnvEditor = lazy(() => import('./EnvEditor'));
const BenchmarkTargets = lazy(() => import('./BenchmarkTargets'));
const AppLogs = lazy(() => import('./AppLogs'));
const SystemInfo = lazy(() => import('./SystemInfo'));
const ProjectHub = lazy(() => import('./ProjectHub'));

import { useDashboardTheme } from '../Providers';
import { themeOptions } from '../theme';

/**
 * Lazy-mount tab panel: children are mounted only once the tab has been visited
 * at least once ("mount once, keep alive"). This prevents all 7 tabs from
 * mounting simultaneously (the root cause of laggy initial tab transitions),
 * while avoiding a re-mount/re-fetch when switching back to a previously visited tab.
 */
interface LazyTabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  visited: boolean;
}

function LazyTabPanel({ children, value, index, visited }: LazyTabPanelProps) {
  const isActive = value === index;

  // Don't render the subtree at all until the tab has been visited.
  if (!visited) return null;

  return (
    <Box
      role="tabpanel"
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      sx={{
        display: isActive ? 'block' : 'none',
        p: 3,
        opacity: isActive ? 1 : 0,
        transform: isActive ? 'translateY(0px)' : 'translateY(8px)',
        transition: 'opacity 180ms ease, transform 180ms ease',
      }}
    >
      <Suspense
        fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
            <CircularProgress />
          </Box>
        }
      >
        {children}
      </Suspense>
    </Box>
  );
}


function getInitialTab(): number {
  if (typeof window === 'undefined') return 0;

  // Prefer the value injected pre-hydration to prevent initial render mismatch.
  const attr = document.documentElement.dataset.dashboardTab;
  if (attr) {
    const parsed = parseInt(attr, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  try {
    const saved = localStorage.getItem('dashboardTab');
    if (!saved) return 0;
    const parsed = parseInt(saved, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

function useHasMounted(): boolean {
  return useSyncExternalStore(
    () => () => {
      // No-op subscription: we only care about SSR vs client.
    },
    () => true,
    () => false
  );
}

export default function ClientHome() {
  // Initialize from localStorage in a lazy initializer.
  const [tabValue, setTabValue] = useState<number>(getInitialTab);
  const hasMounted = useHasMounted();
  const { currentTheme, setCurrentTheme } = useDashboardTheme();

  // Track which tabs have been visited so we mount-once and keep-alive.
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(() => new Set([getInitialTab()]));

  const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setVisitedTabs((prev) => {
      if (prev.has(newValue)) return prev;
      const next = new Set(prev);
      next.add(newValue);
      return next;
    });
    try {
      localStorage.setItem('dashboardTab', newValue.toString());
    } catch {
      // ignore
    }
  }, []);

  const handleThemeChange = (event: SelectChangeEvent) => {
    const newTheme = event.target.value;
    const nextTheme = themeOptions.some((t) => t.id === newTheme) ? newTheme : 'dark';
    setCurrentTheme(nextTheme);
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <DashboardIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Observability Benchmarking Dashboard
          </Typography>
          <FormControl sx={{ minWidth: 200 }} size="small">
            <InputLabel id="theme-select-label" sx={{ color: 'white' }}>
              Theme
            </InputLabel>
            {hasMounted ? (
              <Select
                labelId="theme-select-label"
                value={currentTheme}
                label="Theme"
                onChange={handleThemeChange}
                sx={{
                  color: 'white',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                }}
              >
                {themeOptions.map((theme) => (
                  <MenuItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              // Avoid SSR/CSR text mismatch by not rendering a theme name until mounted.
              <Select
                labelId="theme-select-label"
                value=""
                label="Theme"
                disabled
                sx={{
                  color: 'white',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                }}
              >
                <MenuItem value="">Loading…</MenuItem>
              </Select>
            )}
          </FormControl>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Paper elevation={3}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              aria-label="dashboard tabs"
              variant="scrollable"
              scrollButtons={false}
            >
              <Tab label="Service Health" />
              <Tab label="Script Runner" />
              <Tab label="Environment Config" />
              <Tab label="Benchmark Targets" />
              <Tab label="Logs" />
              <Tab label="System Info" />
              <Tab label="Project Hub" />
            </Tabs>
          </Box>

          <LazyTabPanel value={tabValue} index={0} visited={visitedTabs.has(0)}>
            <ServiceHealth />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={1} visited={visitedTabs.has(1)}>
            <ScriptRunner />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={2} visited={visitedTabs.has(2)}>
            <EnvEditor />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={3} visited={visitedTabs.has(3)}>
            <BenchmarkTargets />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={4} visited={visitedTabs.has(4)}>
            <AppLogs />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={5} visited={visitedTabs.has(5)}>
            <SystemInfo />
          </LazyTabPanel>

          <LazyTabPanel value={tabValue} index={6} visited={visitedTabs.has(6)}>
            <ProjectHub />
          </LazyTabPanel>
        </Paper>
      </Container>
    </>
  );
}