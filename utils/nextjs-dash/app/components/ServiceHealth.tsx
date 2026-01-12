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
import { fetchJson } from '@/lib/fetchJson';
import { orchestratorConfig } from '@/lib/config';
import {
  buildDockerControlCommand,
  type DockerRestartMode,
  type DockerStartMode,
  type DockerStopMode,
} from '@/lib/dockerComposeControl';

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

export default function ServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState<ServiceMessage | null>(null);

  const fetchAllServices = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchJson<{ services?: HealthApiService[] }>(`/api/health`);
      const normalized = (data.services || []).map(normalizeServiceFromApi).sort(byName);
      setServices(normalized);
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
    }) => {
      const isDelete = props.ariaLabel === 'Delete';

      return (
        <Box
          display="flex"
          alignItems="center"
          gap={1}
          sx={{
            // Keep action rows compact and consistent with the response-data line rhythm.
            minHeight: 22,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              width: 64,
              color: 'text.secondary',
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {props.label}
          </Typography>
          <Tooltip
            disableInteractive
            placement="left"
            title={
              <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                {props.tooltipCommand}
              </Box>
            }
          >
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
              />

              {canStart && (
                <ActionRow
                  label="Start"
                  ariaLabel="Start"
                  tooltipCommand={startCommand}
                  onClick={() => submitDockerControl(service.name, { service: service.name, action: 'start' }, 'start')}
                  disabled={isBusy}
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
                     disabled={isBusy}
                     icon={<RestartAltIcon fontSize="small" color="primary" />}
                   />

                   <ActionRow
                     label="Stop"
                     ariaLabel="Stop"
                     tooltipCommand={stopCommand}
                     onClick={() => submitDockerControl(service.name, { service: service.name, action: 'stop' }, 'stop')}
                     disabled={isBusy}
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
                      disabled={isBusy}
                      icon={<CachedIcon fontSize="small" sx={{ color: 'warning.main' }} />}
                    />
                  )}

                   <ActionRow
                     label="Delete"
                     ariaLabel="Delete"
                     tooltipCommand={deleteCommand}
                     onClick={() =>
                       submitDockerControl(
                         service.name,
                         { service: service.name, action: 'stop', stopMode: 'delete' },
                         'delete'
                       )
                     }
                     disabled={isBusy}
                     icon={
                       <DeleteOutlineIcon
                         fontSize="small"
                         sx={{ color: 'red' }}
                       />
                     }
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
