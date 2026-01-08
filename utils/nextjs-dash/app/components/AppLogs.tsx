'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArticleIcon from '@mui/icons-material/Article';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { clearClientLogs, subscribeClientLogs } from '@/lib/clientLogs';

type UiLevel = 'debug' | 'info' | 'warn' | 'error';
type UiSource = 'client' | 'server';

interface LogEntry {
  ts: number;
  level: UiLevel;
  source: UiSource;
  message: string;
  meta?: unknown;
}

function tsToTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function extractRequestId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as { requestId?: unknown };
  return typeof m.requestId === 'string' && m.requestId.trim() ? m.requestId : null;
}

export default function AppLogs() {
  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasMountedRef = useRef(false);

  // Subscribe to captured browser console logs.
  useEffect(() => {
    return subscribeClientLogs((entries) => {
      setClientLogs(
        entries.map((e) => ({
          ts: e.ts,
          level: e.level,
          source: 'client',
          message: e.message,
        }))
      );
    });
  }, []);

  // Stream server logs via SSE.
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const appendServerEntries = (incoming: LogEntry[]) => {
      if (!incoming.length) return;
      setServerLogs((prev) => {
        const merged = [...prev, ...incoming.map((e) => ({ ...e, source: 'server' as const }))];
        const seen = new Set<string>();
        const deduped: LogEntry[] = [];
        for (const m of merged) {
          const key = `${m.ts}|${m.level}|${m.message}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(m);
        }
        return deduped.slice(-2000);
      });
    };

    async function fallbackSnapshot() {
      try {
        const res = await fetch('/api/logs');
        const data = (await res.json()) as {
          entries?: Array<{ ts: number; level: UiLevel; source: UiSource; message: string; meta?: unknown }>;
        };
        const incoming = Array.isArray(data?.entries) ? data.entries : [];
        appendServerEntries(incoming.map((e) => ({ ...e, source: 'server' as const })));
      } catch {
        // ignore
      }
    }

    const connect = () => {
      try {
        const sinceTs = serverLogs.length ? serverLogs[serverLogs.length - 1].ts : undefined;
        const url = sinceTs ? `/api/logs/stream?sinceTs=${sinceTs}` : '/api/logs/stream';
        es = new EventSource(url);

        es.onmessage = (evt) => {
          if (cancelled) return;
          try {
            const parsed = JSON.parse(evt.data) as { ts: number; level: UiLevel; message: string; meta?: unknown };
            if (!parsed?.ts || !parsed?.level || typeof parsed?.message !== 'string') return;
            appendServerEntries([
              {
                ts: parsed.ts,
                level: parsed.level,
                source: 'server',
                message: parsed.message,
                meta: parsed.meta,
              },
            ]);
          } catch {
            // ignore
          }
        };

        es.onerror = () => {
          // If SSE fails (proxy/browser), fall back to a snapshot and let the browser retry.
          es?.close();
          es = null;
          void fallbackSnapshot();
        };
      } catch {
        void fallbackSnapshot();
      }
    };

    // Always load an initial snapshot so the list is populated even if SSE is slow/blocked.
    void fallbackSnapshot();
    connect();

    return () => {
      cancelled = true;
      es?.close();
      es = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearLogs = async () => {
    clearClientLogs();
    setServerLogs([]);
    try {
      await fetch('/api/logs', { method: 'DELETE' });
    } catch {
      // ignore
    }
  };

  const handleFilterChange = (_event: React.MouseEvent<HTMLElement>, newFilter: string) => {
    if (newFilter !== null) {
      setFilter(newFilter);
    }
  };

  const mergedLogs = useMemo(() => {
    const merged = [...clientLogs, ...serverLogs];
    merged.sort((a, b) => a.ts - b.ts);
    return merged;
  }, [clientLogs, serverLogs]);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return mergedLogs;
    if (filter === 'server' || filter === 'client') {
      return mergedLogs.filter((l) => l.source === filter);
    }
    return mergedLogs.filter((log) => log.level === filter);
  }, [filter, mergedLogs]);

  // Track whether the user is near the bottom, so we don't force-scroll.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 40;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Auto-scroll only if we were already at the bottom.
  // Use scrollTop assignment (more stable than scrollIntoView) and skip the very first paint.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (shouldStickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLogs.length]);

  const getLevelColor = (
    level: string
  ): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (level) {
      case 'error':
        return 'error';
      case 'warn':
        return 'warning';
      case 'debug':
        return 'default';
      default:
        return 'info';
    }
  };

  const getSourceColor = (
    source: UiSource
  ): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    return source === 'server' ? 'secondary' : 'default';
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
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
            Frontend console logs + buffered Next.js server logs (live)
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <ToggleButtonGroup value={filter} exclusive onChange={handleFilterChange} size="small">
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="client">Client</ToggleButton>
            <ToggleButton value="server">Server</ToggleButton>
            <ToggleButton value="info">Info</ToggleButton>
            <ToggleButton value="warn">Warn</ToggleButton>
            <ToggleButton value="error">Error</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" startIcon={<DeleteIcon />} onClick={clearLogs} size="small">
            Clear
          </Button>
        </Box>
      </Box>

      <Paper
        ref={scrollContainerRef}
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
          filteredLogs.map((log, index) => {
            const rid = log.source === 'server' ? extractRequestId(log.meta) : null;
            return (
              <Box
                key={`${log.ts}-${index}`}
                sx={{
                  py: 0.5,
                  borderBottom: index < filteredLogs.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography
                    component="span"
                    sx={{ color: 'text.secondary', minWidth: '90px', fontSize: '0.75rem' }}
                  >
                    {tsToTime(log.ts)}
                  </Typography>
                  <Chip
                    label={log.source.toUpperCase()}
                    color={getSourceColor(log.source)}
                    size="small"
                    sx={{ minWidth: '75px', fontSize: '0.7rem', height: '20px' }}
                  />
                  <Chip
                    label={log.level.toUpperCase()}
                    color={getLevelColor(log.level)}
                    size="small"
                    sx={{ minWidth: '70px', fontSize: '0.7rem', height: '20px' }}
                  />
                  {rid && (
                    <Tooltip title={`Request ID: ${rid}`} arrow>
                      <Chip
                        label={`RID ${rid.slice(0, 6)}`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: '20px' }}
                        onClick={() => void copyText(rid)}
                        onDelete={() => void copyText(rid)}
                        deleteIcon={
                          <IconButton size="small" aria-label="copy request id">
                            <ContentCopyIcon fontSize="inherit" />
                          </IconButton>
                        }
                      />
                    </Tooltip>
                  )}
                  <Typography component="span" sx={{ wordBreak: 'break-word', flex: 1 }}>
                    {log.message}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Showing {filteredLogs.length} logs (client max 1000, server max 2000)
      </Typography>
    </Box>
  );
}
