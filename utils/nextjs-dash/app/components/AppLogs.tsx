'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArticleIcon from '@mui/icons-material/Article';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export default function AppLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Capture console logs
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    const addLog = (level: 'info' | 'warn' | 'error', message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, { timestamp, level, message }].slice(-100)); // Keep last 100 logs
    };

    console.log = (...args) => {
      originalConsoleLog(...args);
      addLog('info', args.join(' '));
    };

    console.warn = (...args) => {
      originalConsoleWarn(...args);
      addLog('warn', args.join(' '));
    };

    console.error = (...args) => {
      originalConsoleError(...args);
      addLog('error', args.join(' '));
    };

    return () => {
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const handleFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: string) => {
    if (newFilter !== null) {
      setFilter(newFilter);
    }
  };

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level === filter);

  const getLevelColor = (level: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (level) {
      case 'error':
        return 'error';
      case 'warn':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ArticleIcon /> Application Logs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time dashboard logs for troubleshooting and monitoring
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <ToggleButtonGroup
            value={filter}
            exclusive
            onChange={handleFilterChange}
            size="small"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="info">Info</ToggleButton>
            <ToggleButton value="warn">Warn</ToggleButton>
            <ToggleButton value="error">Error</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={clearLogs}
            size="small"
          >
            Clear
          </Button>
        </Box>
      </Box>

      <Paper
        sx={{
          bgcolor: 'background.default',
          p: 2,
          maxHeight: '500px',
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
        }}
      >
        {filteredLogs.length === 0 ? (
          <Typography color="text.secondary">No logs to display</Typography>
        ) : (
          filteredLogs.map((log, index) => (
            <Box
              key={index}
              sx={{
                py: 0.5,
                borderBottom: index < filteredLogs.length - 1 ? 1 : 0,
                borderColor: 'divider',
              }}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <Typography
                  component="span"
                  sx={{ color: 'text.secondary', minWidth: '80px', fontSize: '0.75rem' }}
                >
                  {log.timestamp}
                </Typography>
                <Chip
                  label={log.level.toUpperCase()}
                  color={getLevelColor(log.level)}
                  size="small"
                  sx={{ minWidth: '70px', fontSize: '0.7rem', height: '20px' }}
                />
                <Typography component="span" sx={{ wordBreak: 'break-word', flex: 1 }}>
                  {log.message}
                </Typography>
              </Box>
            </Box>
          ))
        )}
        <div ref={logsEndRef} />
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Showing last {filteredLogs.length} logs (max 100)
      </Typography>
    </Box>
  );
}
