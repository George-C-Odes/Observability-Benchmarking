'use client';

import { useState, useSyncExternalStore } from 'react';
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
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import DashboardIcon from '@mui/icons-material/Dashboard';

import EnvEditor from './EnvEditor';
import ScriptRunner from './ScriptRunner';
import SystemInfo from './SystemInfo';
import ServiceHealth from './ServiceHealth';
import AppLogs from './AppLogs';
import Resources from './Resources';
import { useDashboardTheme } from '../Providers';
import { themeOptions } from '../theme';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  const isActive = value === index;

  return (
    <Box
      role="tabpanel"
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
      sx={{
        display: isActive ? 'block' : 'none',
        p: 3,
        // Keep layout stable; just fade/slide content in.
        opacity: isActive ? 1 : 0,
        transform: isActive ? 'translateY(0px)' : 'translateY(8px)',
        transition: 'opacity 180ms ease, transform 180ms ease',
      }}
    >
      {children}
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    try {
      localStorage.setItem('dashboardTab', newValue.toString());
    } catch {
      // ignore
    }
  };

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
              <Tab label="System Info" />
              <Tab label="Service Health" />
              <Tab label="Environment Config" />
              <Tab label="Script Runner" />
              <Tab label="Logs" />
              <Tab label="Resources" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <SystemInfo />
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <ServiceHealth />
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <EnvEditor />
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <ScriptRunner />
          </TabPanel>

          <TabPanel value={tabValue} index={4}>
            <AppLogs />
          </TabPanel>

          <TabPanel value={tabValue} index={5}>
            <Resources />
          </TabPanel>
        </Paper>
      </Container>
    </>
  );
}
