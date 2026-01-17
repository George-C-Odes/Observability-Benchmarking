'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Stack,
  Link,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import CachedIcon from '@mui/icons-material/Cached';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PendingIcon from '@mui/icons-material/Pending';
import AppsIcon from '@mui/icons-material/Apps';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BoltIcon from '@mui/icons-material/Bolt';
import SummarizeIcon from '@mui/icons-material/Summarize';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { fetchJson } from '@/lib/fetchJson';
import { orchestratorConfig } from '@/lib/config';
import {
  buildDockerControlCommand,
  type DockerRestartMode,
  type DockerStartMode,
  type DockerStopMode,
} from '@/lib/dockerComposeControl';
import { useServiceActionsConfig } from '@/app/hooks/useServiceActionsConfig';

interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'pending';
  responseTime?: number;
  baseUrl?: string;
  error?: string;
  body?: unknown;
}

type ServiceMessage = {
  type: 'success' | 'error';
  text: string;
  service?: string;
};

function toPending(next: ServiceHealth): ServiceHealth {
  return {
    ...next,
    status: 'pending',
  };
}

function getStatusUI(status: ServiceHealth['status']): {
  label: string;
  color: 'success' | 'error' | 'warning';
  icon: React.ReactNode;
} {
  if (status === 'up') {
    return { label: 'UP', color: 'success', icon: <CheckCircleIcon color="success" /> };
  }
  if (status === 'down') {
    return { label: 'DOWN', color: 'error', icon: <CancelIcon color="error" /> };
  }
  return { label: 'PENDING', color: 'warning', icon: <CircularProgress size={20} /> };
}

interface HealthApiService {
  name?: unknown;
  status?: unknown;
  responseTime?: unknown;
  baseUrl?: unknown;
  error?: unknown;
  body?: unknown;
}

function normalizeServiceFromApi(raw: HealthApiService | null | undefined): ServiceHealth {
  const name = typeof raw?.name === 'string' ? raw.name : 'unknown';
  const rawStatus = raw?.status;

  const status: ServiceHealth['status'] =
    rawStatus === 'up' || rawStatus === 'down' || rawStatus === 'pending'
      ? rawStatus
      : rawStatus === 'UP'
        ? 'up'
        : rawStatus === 'DOWN'
          ? 'down'
          : rawStatus === 'PENDING'
            ? 'pending'
            : 'down';

  return {
    name,
    status,
    responseTime: typeof raw?.responseTime === 'number' ? raw.responseTime : undefined,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl : undefined,
    error: typeof raw?.error === 'string' ? raw.error : undefined,
    body: raw?.body,
  };
}

function byName(a: ServiceHealth, b: ServiceHealth) {
  return a.name.localeCompare(b.name);
}

function isProbablyHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function countByStatus(services: ServiceHealth[]): { up: number; down: number; pending: number; total: number } {
  let up = 0;
  let down = 0;
  let pending = 0;

  for (const s of services) {
    if (s.status === 'up') up += 1;
    else if (s.status === 'pending') pending += 1;
    else down += 1;
  }

  return { up, down, pending, total: services.length };
}

function formatRelativeSince(nowMs: number, thenMs: number): string {
  const deltaMs = Math.max(0, nowMs - thenMs);

  if (deltaMs < 5_000) return 'Just now';
  if (deltaMs < 60_000) return `${Math.floor(deltaMs / 1_000)}s ago`;
  if (deltaMs < 60 * 60_000) return `${Math.floor(deltaMs / 60_000)}m ago`;
  if (deltaMs < 24 * 60 * 60_000) return `${Math.floor(deltaMs / (60 * 60_000))}h ago`;

  // Older than a day: show an explicit date+time.
  return new Date(thenMs).toLocaleString();
}

function formatExactTime(d: Date): string {
  // Keep it short and consistent (HH:MM:SS), independent of locale.
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isObsCoreServiceName(serviceName: string): boolean {
  return ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(serviceName);
}

export default function ServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<ServiceMessage | null>(null);

  const serviceActionsCfg = useServiceActionsConfig();

  const statusCounts = useMemo(() => countByStatus(services), [services]);
  const [countsPulseKey, setCountsPulseKey] = useState(0);
  const [countsPulseOn, setCountsPulseOn] = useState(false);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [updatedFlashOn, setUpdatedFlashOn] = useState(false);

  // Ticker used to keep the relative 'Last updated' text fresh.
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    if (!lastUpdatedAt) return;

    const id = window.setInterval(() => setNowTick((t) => t + 1), 1_000);
    return () => window.clearInterval(id);
  }, [lastUpdatedAt]);

  function markUpdated() {
    setLastUpdatedAt(new Date());
    setUpdatedFlashOn(true);
    const t = setTimeout(() => setUpdatedFlashOn(false), 900);
    return () => clearTimeout(t);
  }

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return '—';

    // Depend on nowTick so component recalculates every second once we have a timestamp.
    void nowTick;

    const thenMs = lastUpdatedAt.getTime();
    const deltaMs = Math.max(0, Date.now() - thenMs);

    // When older than a day, show explicit date+time.
    if (deltaMs >= 24 * 60 * 60_000) {
      return lastUpdatedAt.toLocaleString();
    }

    const rel = formatRelativeSince(Date.now(), thenMs);
    const exact = formatExactTime(lastUpdatedAt);
    return `${rel} · ${exact}`;
  }, [lastUpdatedAt, nowTick]);

  // Trigger an eye-catching pulse whenever counts change (refresh, optimistic updates, etc.)
  useEffect(() => {
    setCountsPulseKey((k) => k + 1);
    setCountsPulseOn(true);
    const t = setTimeout(() => setCountsPulseOn(false), 700);
    return () => clearTimeout(t);
  }, [statusCounts.up, statusCounts.down, statusCounts.pending, statusCounts.total]);

  const fetchAllServices = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchJson<{ services?: HealthApiService[] }>(`/api/health`);
      const normalized = (data.services || []).map(normalizeServiceFromApi).sort(byName);
      setServices(normalized);
      markUpdated();
    } catch {
      setMessage({ type: 'error', text: 'Failed to check service health (dashboard backend unreachable)' });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshService = useCallback(async (serviceName: string) => {
    setRefreshing(serviceName);
    try {
      const data = await fetchJson<{ services?: HealthApiService[] }>(`/api/health?service=${encodeURIComponent(serviceName)}`);
      const raw = Array.isArray(data?.services) && data.services.length ? data.services[0] : null;
      const single = raw ? normalizeServiceFromApi(raw) : null;

      if (single) {
        setServices((prev) => prev.map((s) => (s.name === serviceName ? single : s)).sort(byName));
        markUpdated();
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(null);
    }
  }, []);

  const submitDockerControl = useCallback(
    async (
      serviceName: string,
      payload: {
        service: string;
        action: 'start' | 'stop' | 'restart';
        startMode?: DockerStartMode;
        restartMode?: DockerRestartMode;
        stopMode?: DockerStopMode;
      },
      optimisticActionLabel: string
    ) => {
      setSubmitting(serviceName);
      setServices((prev) => prev.map((s) => (s.name === serviceName ? toPending(s) : s)));
      markUpdated();

      try {
        await fetchJson(`/api/docker/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        setMessage({
          type: 'success',
          text: `Submitted ${optimisticActionLabel} for ${serviceName}. Status will update after refresh.`,
          service: serviceName,
        });
      } catch {
        setMessage({
          type: 'error',
          text: `Failed to submit ${optimisticActionLabel} for ${serviceName}.`,
          service: serviceName,
        });
        void refreshService(serviceName);
      } finally {
        setSubmitting(null);
      }
    },
    [refreshService]
  );

  useEffect(() => {
    void fetchAllServices();
  }, [fetchAllServices]);

  const groupedServices = useMemo(() => {
    const observability = services
      .filter((s) => ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(s.name))
      .sort(byName);
    const spring = services.filter((s) => s.name.startsWith('spring-')).sort(byName);
    const quarkus = services.filter((s) => s.name.startsWith('quarkus-')).sort(byName);
    const go = services.filter((s) => s.name.startsWith('go')).sort(byName);
    const utils = services.filter((s) => ['nextjs-dash', 'orchestrator', 'wrk2'].includes(s.name)).sort(byName);

    return {
      observability,
      spring,
      quarkus,
      go,
      utils,
    };
  }, [services]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  const renderServiceCard = (service: ServiceHealth) => {
    const statusUI = getStatusUI(service.status);
    const isBusy = refreshing === service.name || submitting === service.name;

    const canStart = service.status === 'down';
    const canManageContainer = service.status === 'up';
    const canRecreate = canManageContainer && service.name !== 'orchestrator';

    // Runtime-config gating (server-relayed). If config isn't loaded yet, default to:
    // - OBS core services enabled
    // - everything else disabled
    const hasConfig = !serviceActionsCfg.loading && !serviceActionsCfg.error;
    const cfgEnabledRaw = hasConfig ? serviceActionsCfg.config.enabled?.[service.name] : undefined;

    const enabledByConfig =
      typeof cfgEnabledRaw === 'boolean'
        ? cfgEnabledRaw
        : // No config yet / missing entry => safe default.
          isObsCoreServiceName(service.name);

    const actionFlags = {
      start: enabledByConfig,
      restart: enabledByConfig,
      stop: enabledByConfig,
      recreate: enabledByConfig,
      delete: enabledByConfig,
    };

    const featureDisabledReason = 'feature disabled';

    const canStartAction = canStart && actionFlags.start;
    const canRestartAction = canManageContainer && actionFlags.restart;
    const canStopAction = canManageContainer && actionFlags.stop;
    const canRecreateAction = canRecreate && actionFlags.recreate;
    const canDeleteAction = canManageContainer && actionFlags.delete;

    const upstreamHealthUrl = `${orchestratorConfig.url}/v1/health?service=${encodeURIComponent(service.name)}`;

    const startCommand = buildDockerControlCommand({
      service: service.name,
      action: 'start',
    });
    const restartCommand = buildDockerControlCommand({
      service: service.name,
      action: 'restart',
    });
    const stopCommand = buildDockerControlCommand({
      service: service.name,
      action: 'stop',
    });

    const recreateCommand = buildDockerControlCommand({
      service: service.name,
      action: 'restart',
      restartMode: 'recreate',
    });
    const deleteCommand = buildDockerControlCommand({
      service: service.name,
      action: 'stop',
      stopMode: 'delete',
    });

    const ActionRow = (props: {
      label: string;
      ariaLabel: string;
      tooltipCommand: string;
      onClick: () => void;
      disabled?: boolean;
      icon: React.ReactNode;
      disabledReason?: string;
      kind?: 'refresh' | 'normal';
    }) => {
      const isDelete = props.ariaLabel === 'Delete';
      const isRefresh = props.kind === 'refresh';

      const tooltip = (
        <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
          {props.tooltipCommand}
          {props.disabledReason ? `\n\n⚠ ${props.disabledReason}` : ''}
        </Box>
      );

      return (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          sx={{
            // Keep action rows compact and consistent with the response-data line rhythm.
            minHeight: 22,
            ...(isRefresh
              ? {
                  borderRadius: 1,
                  px: 0.5,
                  py: 0.25,
                  backgroundColor: 'rgba(25, 118, 210, 0.06)',
                }
              : undefined),
          }}
        >
          <Typography
            variant="caption"
            sx={{
              width: 64,
              color: props.disabled ? 'text.disabled' : isRefresh ? 'primary.main' : 'text.secondary',
              fontWeight: isRefresh ? 800 : 600,
              lineHeight: 1.2,
            }}
          >
            {props.label}
          </Typography>
          <Tooltip disableInteractive placement="left" title={tooltip}>
            <span>
              <IconButton
                aria-label={props.ariaLabel}
                type="button"
                size="small"
                sx={{
                  // MUI IconButton has quite a bit of built-in padding; reduce it to fix the vertical spacing.
                  width: 28,
                  height: 28,
                  p: 0.5,
                  color: isDelete ? 'error.main' : undefined,
                }}
                onClick={props.onClick}
                disabled={props.disabled}
              >
                {props.icon}
              </IconButton>
            </span>
          </Tooltip>
          {props.disabledReason && (
            <Tooltip title={props.disabledReason}>
              <WarningAmberIcon fontSize="small" sx={{ color: 'warning.main', opacity: 0.9 }} />
            </Tooltip>
          )}
        </Box>
      );
    };

    return (
      <Card
        key={service.name}
        sx={{
          px: 1.5,
          // Enable container queries so the card can decide when to stack actions below.
          containerType: 'inline-size',
        }}
      >
        <CardContent sx={{ pb: 1 }}>
          <Box
            sx={{
              display: 'grid',
              // Default: two vertical sections (data + actions).
              gridTemplateColumns: 'minmax(0, 1fr) max-content',
              columnGap: 2,
              rowGap: 1,
              alignItems: 'start',
              minWidth: 0,
              // If the card itself is narrow, stack into a single column to avoid overlap.
              // Use a slightly higher threshold so 3-column layouts at medium viewport sizes don't overlap.
              '@container (max-width: 440px)': {
                gridTemplateColumns: '1fr',
              },
            }}
          >
            {/* Data section (spans full width on xs) */}
            <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
              {/* Header: service icon + name */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: 0,
                  flexWrap: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>{statusUI.icon}</Box>
                <Typography
                  variant="subtitle1"
                  component="div"
                  // Keep title consistent across all cards (including Spring).
                  fontSize={undefined}
                  sx={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    width: '100%',
                    // Prefer keeping names (<= 30 chars) on a single line.
                    // If space is tighter, ellipsize without overlapping the actions column.
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                  }}
                >
                  {service.name}
                </Typography>
              </Box>

              {/* Status row */}
              <Box display="flex" alignItems="center" gap={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Status
                </Typography>
                <Chip label={statusUI.label} color={statusUI.color} size="small" />
              </Box>

              {/* Response data directly below Status (reduced whitespace) */}
              <Box sx={{ mt: 0.5, minWidth: 0 }}>
                {typeof service.responseTime === 'number' && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.25 }}>
                    Response: {service.responseTime}ms
                  </Typography>
                )}

                {service.baseUrl && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.25, wordBreak: 'break-word' }}>
                    Base URL:{' '}
                    {isProbablyHttpUrl(service.baseUrl) ? (
                      <Link href={service.baseUrl} target="_blank" rel="noreferrer" underline="hover">
                        {service.baseUrl}
                      </Link>
                    ) : (
                      service.baseUrl
                    )}
                  </Typography>
                )}

                {service.error && (
                  <Typography variant="caption" color="error" display="block" sx={{ mt: 0.25, wordBreak: 'break-word' }}>
                    {service.error}
                  </Typography>
                )}

                {service.body !== undefined && (
                  <Box sx={{ mt: 0.25 }}>
                    <Tooltip
                      title={
                        <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', maxWidth: 500 }}>
                          {typeof service.body === 'string' ? service.body : JSON.stringify(service.body, null, 2)}
                        </Box>
                      }
                      placement="bottom-start"
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
                        Response body (hover)
                      </Typography>
                    </Tooltip>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Actions section (stacks below on xs, right column on md+) */}
            <Stack
              direction="column"
              spacing={0}
              alignItems="stretch"
              sx={{
                justifySelf: 'end',
                mt: 0,
                '@container (max-width: 440px)': {
                  justifySelf: 'start',
                  mt: 1,
                },
              }}
            >
              <ActionRow
                label="Refresh"
                ariaLabel="Refresh"
                tooltipCommand={upstreamHealthUrl}
                onClick={() => refreshService(service.name)}
                disabled={isBusy}
                icon={refreshing === service.name ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                kind="refresh"
              />

              {canStart && (
                <ActionRow
                  label="Start"
                  ariaLabel="Start"
                  tooltipCommand={startCommand}
                  onClick={() => submitDockerControl(service.name, { service: service.name, action: 'start' }, 'start')}
                  disabled={isBusy || !canStartAction}
                  disabledReason={!actionFlags.start ? featureDisabledReason : undefined}
                  icon={<PlayArrowIcon fontSize="small" color="primary" />}
                />
              )}

              {canManageContainer && (
                <>
                  <ActionRow
                    label="Restart"
                    ariaLabel="Restart"
                    tooltipCommand={restartCommand}
                    onClick={() => submitDockerControl(service.name, { service: service.name, action: 'restart' }, 'restart')}
                    disabled={isBusy || !canRestartAction}
                    disabledReason={!actionFlags.restart ? featureDisabledReason : undefined}
                    icon={<RestartAltIcon fontSize="small" color="primary" />}
                  />

                  <ActionRow
                    label="Stop"
                    ariaLabel="Stop"
                    tooltipCommand={stopCommand}
                    onClick={() => submitDockerControl(service.name, { service: service.name, action: 'stop' }, 'stop')}
                    disabled={isBusy || !canStopAction}
                    disabledReason={!actionFlags.stop ? featureDisabledReason : undefined}
                    icon={<StopCircleIcon fontSize="small" color="error" />}
                  />

                  {canRecreate && (
                    <ActionRow
                      label="Recreate"
                      ariaLabel="Recreate"
                      tooltipCommand={recreateCommand}
                      onClick={() =>
                        submitDockerControl(
                          service.name,
                          { service: service.name, action: 'restart', restartMode: 'recreate' },
                          'recreate'
                        )
                      }
                      disabled={isBusy || !canRecreateAction}
                      disabledReason={!actionFlags.recreate ? featureDisabledReason : undefined}
                      icon={<CachedIcon fontSize="small" sx={{ color: 'warning.main' }} />}
                    />
                  )}

                  <ActionRow
                    label="Delete"
                    ariaLabel="Delete"
                    tooltipCommand={deleteCommand}
                    onClick={() =>
                      submitDockerControl(service.name, { service: service.name, action: 'stop', stopMode: 'delete' }, 'delete')
                    }
                    disabled={isBusy || !canDeleteAction}
                    disabledReason={!actionFlags.delete ? featureDisabledReason : undefined}
                    icon={<DeleteOutlineIcon fontSize="small" sx={{ color: 'red' }} />}
                  />
                </>
              )}
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HealthAndSafetyIcon /> Service Health Status
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Readiness checks for all services in the observability stack
          </Typography>
        </Box>

        <Tooltip
          disableInteractive
          placement="left"
          title={
            <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
              {`${orchestratorConfig.url}/v1/health`}
            </Box>
          }
        >
          <span>
            <Button variant="contained" startIcon={<RefreshIcon />} onClick={fetchAllServices} disabled={loading}>
              Refresh All
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Overview */}
      <Card
        sx={{
          mb: 2,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: countsPulseOn ? 6 : 1,
          transition: 'box-shadow 250ms ease, transform 250ms ease',
          transform: countsPulseOn ? 'translateY(-1px)' : 'translateY(0)',
        }}
      >
        <CardContent
          sx={{
            pb: 2,
            '@keyframes overviewPulse': {
              '0%': { transform: 'scale(1)', opacity: 0.95 },
              '45%': { transform: 'scale(1.01)', opacity: 1 },
              '100%': { transform: 'scale(1)', opacity: 1 },
            },
            '@keyframes updatedFlash': {
              '0%': { backgroundColor: 'rgba(255, 214, 0, 0.0)' },
              '35%': { backgroundColor: 'rgba(255, 214, 0, 0.18)' },
              '100%': { backgroundColor: 'rgba(255, 214, 0, 0.0)' },
            },
          }}
        >
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
            <Box display="flex" alignItems="center" gap={1}>
              <AppsIcon color="primary" />
              <Typography variant="h6">Overview</Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                animation: updatedFlashOn ? 'updatedFlash 900ms ease-in-out' : 'none',
              }}
            >
              <AccessTimeIcon fontSize="small" color="action" />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Last updated
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  color: 'text.primary',
                  fontWeight: 700,
                }}
                data-testid="overview-last-updated"
                title={lastUpdatedAt ? lastUpdatedAt.toLocaleString() : undefined}
              >
                {lastUpdatedText}
              </Typography>
              {countsPulseOn && <BoltIcon fontSize="small" sx={{ color: 'warning.main' }} />}
            </Box>
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Box
            key={countsPulseKey}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, max-content)', md: 'repeat(4, max-content)' },
              gap: { xs: 1, sm: 1.25, md: 1.5 },
              alignItems: 'center',
              animation: countsPulseOn ? 'overviewPulse 650ms ease-in-out' : 'none',
            }}
          >
            <Chip
              icon={<CheckCircleIcon />}
              label={
                <Box
                  sx={{
                    display: 'grid',
                    // Tighten on mobile; keep alignment on larger screens
                    gridTemplateColumns: { xs: '68px 10px 42px', sm: '84px 10px 44px' },
                    alignItems: 'center',
                    columnGap: 0.75,
                  }}
                >
                  <Typography component="span" variant="caption" sx={{ fontWeight: 900, letterSpacing: 0.7 }}>
                    UP
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ opacity: 0.9, textAlign: 'center' }}>
                    :
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      ml: 0,
                      display: 'inline-flex',
                      justifyContent: 'flex-end',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'rgba(255,255,255,0.25)',
                      minWidth: 40,
                    }}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        fontWeight: 900,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      }}
                    >
                      {statusCounts.up}
                    </Typography>
                  </Box>
                </Box>
              }
              color="success"
              size="medium"
              data-testid="overview-up"
              sx={{
                justifyContent: 'flex-start',
                maxWidth: '5cm',
                width: '100%',
                '& .MuiChip-label': { width: '100%' },
              }}
            />
            <Chip
              icon={<CancelIcon />}
              label={
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '68px 10px 42px', sm: '84px 10px 44px' },
                    alignItems: 'center',
                    columnGap: 0.75,
                  }}
                >
                  <Typography component="span" variant="caption" sx={{ fontWeight: 900, letterSpacing: 0.7 }}>
                    DOWN
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ opacity: 0.9, textAlign: 'center' }}>
                    :
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      justifyContent: 'flex-end',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'rgba(255,255,255,0.25)',
                      minWidth: 40,
                    }}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        fontWeight: 900,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      }}
                    >
                      {statusCounts.down}
                    </Typography>
                  </Box>
                </Box>
              }
              color="error"
              size="medium"
              data-testid="overview-down"
              sx={{
                justifyContent: 'flex-start',
                maxWidth: '5cm',
                width: '100%',
                '& .MuiChip-label': { width: '100%' },
              }}
            />
            <Chip
              icon={<PendingIcon />}
              label={
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '68px 10px 42px', sm: '84px 10px 44px' },
                    alignItems: 'center',
                    columnGap: 0.75,
                  }}
                >
                  <Typography component="span" variant="caption" sx={{ fontWeight: 900, letterSpacing: 0.7 }}>
                    PENDING
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ opacity: 0.9, textAlign: 'center' }}>
                    :
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      justifyContent: 'flex-end',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'rgba(255,255,255,0.25)',
                      minWidth: 40,
                    }}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        fontWeight: 900,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      }}
                    >
                      {statusCounts.pending}
                    </Typography>
                  </Box>
                </Box>
              }
              color="warning"
              size="medium"
              data-testid="overview-pending"
              sx={{
                justifyContent: 'flex-start',
                maxWidth: '5cm',
                width: '100%',
                '& .MuiChip-label': { width: '100%' },
              }}
            />
            <Chip
              icon={<SummarizeIcon />}
              label={
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '68px 10px 42px', sm: '84px 10px 44px' },
                    alignItems: 'center',
                    columnGap: 0.75,
                  }}
                >
                  <Typography component="span" variant="caption" sx={{ fontWeight: 900, letterSpacing: 0.7 }}>
                    TOTAL
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ opacity: 0.9, textAlign: 'center' }}>
                    :
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      justifyContent: 'flex-end',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      bgcolor: 'rgba(0,0,0,0.04)',
                      minWidth: 40,
                    }}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        fontWeight: 900,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      }}
                    >
                      {statusCounts.total}
                    </Typography>
                  </Box>
                </Box>
              }
              variant="outlined"
              size="medium"
              data-testid="overview-total"
              sx={{
                justifyContent: 'flex-start',
                maxWidth: '5cm',
                width: '100%',
                '& .MuiChip-label': { width: '100%' },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* Observability Stack */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Observability Stack
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {groupedServices.observability.map((service) => renderServiceCard(service))}
      </Box>

      {/* Spring Services */}
      {groupedServices.spring.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Spring Services
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
              mb: 3,
            }}
          >
            {groupedServices.spring.map((service) => renderServiceCard(service))}
          </Box>
        </>
      )}

      {/* Quarkus Services */}
      {groupedServices.quarkus.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Quarkus Services
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {groupedServices.quarkus.map((service) => renderServiceCard(service))}
          </Box>
        </>
      )}

      {/* Go Services */}
      {groupedServices.go.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Go Services
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {groupedServices.go.map((service) => renderServiceCard(service))}
          </Box>
        </>
      )}

      {/* Utils */}
      {groupedServices.utils.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Utils
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {groupedServices.utils.map((service) => renderServiceCard(service))}
          </Box>
        </>
      )}
    </Box>
  );
}
