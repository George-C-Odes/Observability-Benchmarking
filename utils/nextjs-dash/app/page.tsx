'use client';

import React, { useState } from 'react';
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
  Fade,
  Slide,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import DashboardIcon from '@mui/icons-material/Dashboard';
import EnvEditor from './components/EnvEditor';
import ScriptRunner from './components/ScriptRunner';
import SystemInfo from './components/SystemInfo';
import ServiceHealth from './components/ServiceHealth';
import AppLogs from './components/AppLogs';
import Resources from './components/Resources';
import { themeOptions } from './theme';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && (
        <Fade in={value === index} timeout={600}>
          <Slide direction="up" in={value === index} timeout={400}>
            <Box sx={{ p: 3 }}>{children}</Box>
          </Slide>
        </Fade>
      )}
    </div>
  );
}

export default function Home() {
  const [tabValue, setTabValue] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dashboardTab');
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });

  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dashboardTheme') || 'dark';
    }
    return 'dark';
  });

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardTab', newValue.toString());
    }
  };

  const handleThemeChange = (event: SelectChangeEvent) => {
    const newTheme = event.target.value;
    setCurrentTheme(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboardTheme', newTheme);
      window.location.reload(); // Reload to apply theme
    }
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
            <InputLabel id="theme-select-label" sx={{ color: 'white' }}>Theme</InputLabel>
            <Select
              labelId="theme-select-label"
              value={currentTheme}
              label="Theme"
              onChange={handleThemeChange}
              sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.23)' } }}
            >
              {themeOptions.map((theme) => (
                <MenuItem key={theme.id} value={theme.id}>
                  {theme.name}
                </MenuItem>
              ))}
            </Select>
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
