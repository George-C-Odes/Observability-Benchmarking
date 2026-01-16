'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import StorageIcon from '@mui/icons-material/Storage';
import ComputerIcon from '@mui/icons-material/Computer';
import ListAltIcon from '@mui/icons-material/ListAlt';

import { clearClientLogs, setClientLogsMaxEntries, subscribeClientLogs } from '@/lib/clientLogs';
import { useAppLogsConfig } from '@/app/hooks/useAppLogsConfig';

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
  const { config: appLogsConfig } = useAppLogsConfig();

  const [clientLogs, setClientLogs] = useState<LogEntry[]>([]);
  const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasMountedRef = useRef(false);
  const lastServerTsRef = useRef<number | null>(null);
  const [pulseUntilMs, setPulseUntilMs] = useState<number>(0);
  const [pulseNow, setPulseNow] = useState<number>(() => Date.now());

  const pulseActive = pulseUntilMs > 0 && pulseUntilMs > pulseNow;

  const pulseSettleTimerRef = useRef<number | null>(null);

  const pulse = useCallback(() => {
    // Keep glow active for 1s after the last log arrives.
    const until = Date.now() + 1000;
    setPulseUntilMs(until);
    setPulseNow(Date.now());

    // Ensure we don't accumulate timeouts during bursty log streams.
    if (pulseSettleTimerRef.current !== null) {
      window.clearTimeout(pulseSettleTimerRef.current);
      pulseSettleTimerRef.current = null;
    }

    pulseSettleTimerRef.current = window.setTimeout(() => {
      setPulseNow(Date.now());
      pulseSettleTimerRef.current = null;
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (pulseSettleTimerRef.current !== null) {
        window.clearTimeout(pulseSettleTimerRef.current);
        pulseSettleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    lastServerTsRef.current = serverLogs.length ? serverLogs[serverLogs.length - 1].ts : null;
  }, [serverLogs]);

  // Apply runtime-configured client log cap (in memory).
  useEffect(() => {
    setClientLogsMaxEntries(appLogsConfig.clientMaxEntries);
  }, [appLogsConfig.clientMaxEntries]);

  // Subscribe to captured browser console logs.
  useEffect(() => {
    return subscribeClientLogs((entries) => {
      const mapped: LogEntry[] = entries
        .map((e) => ({
          ts: e.ts,
          level: e.level as UiLevel,
          source: 'client' as const,
          message: e.message,
        }))
        .slice(-appLogsConfig.clientMaxEntries);

      setClientLogs(mapped);
      if (mapped.length) {
        pulse();
      }
    });
  }, [appLogsConfig.clientMaxEntries, pulse]);

  const appendServerEntries = useCallback(
    (incoming: LogEntry[]) => {
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
        return deduped.slice(-appLogsConfig.serverMaxEntries);
      });
    },
    [appLogsConfig.serverMaxEntries]
  );

  const fallbackSnapshot = useCallback(async () => {
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
  }, [appendServerEntries]);

  const connectSse = useCallback(
    (sinceTs?: number) => {
      const url = sinceTs ? `/api/logs/stream?sinceTs=${sinceTs}` : '/api/logs/stream';
      return new EventSource(url);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    // Load a snapshot asynchronously to avoid triggering react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      if (cancelled) return;
      void fallbackSnapshot();
    });

    const connect = () => {
      try {
        const sinceTs = lastServerTsRef.current ?? undefined;
        es = connectSse(sinceTs);

        es.onopen = () => {
          // If stream connects, we can still refresh snapshot once to backfill any missed entries.
          // Run it asynchronously so state updates happen as a reaction to an external event.
          queueMicrotask(() => {
            if (cancelled) return;
            void fallbackSnapshot();
          });
        };

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
            pulse();
          } catch {
            // ignore
          }
        };

        es.onerror = () => {
          // If SSE fails (proxy/browser), fall back to a snapshot and let the browser retry.
          es?.close();
          es = null;
          queueMicrotask(() => {
            if (cancelled) return;
            void fallbackSnapshot();
          });
        };
      } catch {
        queueMicrotask(() => {
          if (cancelled) return;
          void fallbackSnapshot();
        });
      }
    };

    connect();

    return () => {
      cancelled = true;
      es?.close();
      es = null;
    };
  }, [appendServerEntries, connectSse, fallbackSnapshot, pulse]);


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

    const recompute = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 40;
    };

    el.addEventListener('scroll', recompute, { passive: true });
    recompute();

    return () => {
      el.removeEventListener('scroll', recompute);
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

  const lastClientCount = clientLogs.length;
  const lastServerCount = serverLogs.length;
  const shownCount = filteredLogs.length;

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
            <ToggleButton value="debug">Debug</ToggleButton>
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

      <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          Logs:
        </Typography>

        <Chip
          size="small"
          variant="outlined"
          icon={<ListAltIcon fontSize="small" />}
          label={`shown ${shownCount}`}
          sx={{
            fontWeight: 'bold',
            transition: 'transform 150ms ease, filter 300ms ease, box-shadow 220ms ease',
            transform: pulseActive ? 'translateY(-0.5px)' : 'none',
            filter: pulseActive ? 'saturate(1.1)' : 'none',
            boxShadow: pulseActive
              ? '0 0 0 4px rgba(255,255,255,0.06), 0 0 10px 2px rgba(255,255,255,0.06)'
              : 'none',
          }}
        />

        <Chip
          size="small"
          variant="outlined"
          color={lastClientCount >= appLogsConfig.clientMaxEntries ? 'warning' : 'default'}
          icon={<ComputerIcon fontSize="small" />}
          label={`client ${lastClientCount}/${appLogsConfig.clientMaxEntries}`}
          sx={{
            fontWeight: 'bold',
            transition: 'transform 150ms ease, filter 300ms ease',
            transform: pulseActive ? 'translateY(-0.5px)' : 'none',
            filter: pulseActive ? 'saturate(1.1)' : 'none',
          }}
        />

        <Chip
          size="small"
          variant="outlined"
          color={lastServerCount >= appLogsConfig.serverMaxEntries ? 'warning' : 'default'}
          icon={<StorageIcon fontSize="small" />}
          label={`server ${lastServerCount}/${appLogsConfig.serverMaxEntries}`}
          sx={{
            fontWeight: 'bold',
            transition: 'transform 150ms ease, filter 300ms ease',
            transform: pulseActive ? 'translateY(-0.5px)' : 'none',
            filter: pulseActive ? 'saturate(1.1)' : 'none',
          }}
        />

        <Typography variant="caption" color="text.secondary">
          (shown is after filters; client/server are buffer last/max)
        </Typography>
      </Box>
    </Box>
  );
}
