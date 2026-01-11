'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  FormControlLabel,
  Checkbox,
  Stack,
  Divider,
  Link,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { fetchJson } from '@/lib/fetchJson';

interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'pending';
  responseTime?: number;
  baseUrl?: string;
  error?: string;
  body?: unknown;
}

type ControlAction = 'start' | 'stop' | 'restart';

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

function buildComposeCommand(params: {
  service: string;
  action: ControlAction;
  forceRecreate: boolean;
  deleteContainer: boolean;
}): string {
  const { service, action, forceRecreate, deleteContainer } = params;

  if (action === 'start' || action === 'restart') {
    return `docker compose up -d${forceRecreate ? ' --force-recreate' : ''} ${service}`;
  }

  // stop
  let command = `docker compose stop ${service}`;
  if (deleteContainer) {
    command += `; docker compose rm -f ${service}`;
  }
  return command;
}

function isProbablyHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export default function ServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [forceRecreate, setForceRecreate] = useState(false);
  const [deleteContainer, setDeleteContainer] = useState(false);
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

  const submitControl = useCallback(
    async (serviceName: string, action: ControlAction) => {
      setSubmitting(serviceName);

      // optimistic: mark as pending
      setServices((prev) => prev.map((s) => (s.name === serviceName ? toPending(s) : s)));

      const command = buildComposeCommand({
        service: serviceName,
        action,
        forceRecreate: action === 'stop' ? false : forceRecreate,
        deleteContainer: action === 'stop' ? deleteContainer : false,
      });

      try {
        await fetchJson(`/api/orchestrator/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });

        setMessage({
          type: 'success',
          text: `Submitted ${action} for ${serviceName}. Status will update after refresh.`,
          service: serviceName,
        });
      } catch {
        setMessage({
          type: 'error',
          text: `Failed to submit ${action} for ${serviceName}.`,
          service: serviceName,
        });
        void refreshService(serviceName);
      } finally {
        setSubmitting(null);
      }
    },
    [deleteContainer, forceRecreate, refreshService]
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

  const renderServiceCard = (service: ServiceHealth, denseTitle: boolean = false) => {
    const statusUI = getStatusUI(service.status);
    const isBusy = refreshing === service.name || submitting === service.name;

    const canStart = service.status === 'down';
    const canStopRestart = service.status === 'up';

    return (
      <Card key={service.name}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" component="div" fontSize={denseTitle ? '0.9rem' : undefined}>
              {service.name}
            </Typography>
            {statusUI.icon}
          </Box>
          <Chip
            label={statusUI.label}
            color={statusUI.color}
            size="small"
            sx={{ mt: 1 }}
          />

          {typeof service.responseTime === 'number' && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Response: {service.responseTime}ms
            </Typography>
          )}

          {service.baseUrl && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
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
            <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
              {service.error}
            </Typography>
          )}

          {service.body !== undefined && (
            <Box sx={{ mt: 1 }}>
              <Tooltip
                title={
                  <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
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
        </CardContent>
        <CardActions sx={{ px: 2, pb: 2, pt: 0, flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Tooltip title="Refresh this service" disableInteractive>
              <IconButton
                aria-label="Refresh"
                type="button"
                size="small"
                onClick={() => refreshService(service.name)}
                disabled={isBusy}
              >
                {refreshing === service.name ? <CircularProgress size={20} /> : <RefreshIcon />}
              </IconButton>
            </Tooltip>

            <Box display="flex" gap={1}>
              {canStart && (
                <Tooltip title="Start" disableInteractive>
                  <IconButton
                    aria-label="Start"
                    type="button"
                    size="small"
                    onClick={() => submitControl(service.name, 'start')}
                    disabled={isBusy}
                    color="primary"
                  >
                    <PlayArrowIcon />
                  </IconButton>
                </Tooltip>
              )}

              {canStopRestart && (
                <>
                  <Tooltip title="Restart" disableInteractive>
                    <IconButton
                      aria-label="Restart"
                      type="button"
                      size="small"
                      onClick={() => submitControl(service.name, 'restart')}
                      disabled={isBusy}
                      color="primary"
                    >
                      <RestartAltIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Stop" disableInteractive>
                    <IconButton
                      aria-label="Stop"
                      type="button"
                      size="small"
                      onClick={() => submitControl(service.name, 'stop')}
                      disabled={isBusy}
                      color="error"
                    >
                      <StopCircleIcon />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          </Box>

          {(canStart || canStopRestart) && (
            <>
              <Divider />
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                {(canStart || canStopRestart) && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={forceRecreate}
                        onChange={(e) => setForceRecreate(e.target.checked)}
                        disabled={isBusy}
                      />
                    }
                    label="--force-recreate"
                  />
                )}
                {canStopRestart && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={deleteContainer}
                        onChange={(e) => setDeleteContainer(e.target.checked)}
                        disabled={isBusy}
                      />
                    }
                    label="Delete container"
                  />
                )}
              </Stack>
            </>
          )}
        </CardActions>
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
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={fetchAllServices} disabled={loading}>
          Refresh All
        </Button>
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
            {groupedServices.spring.map((service) => renderServiceCard(service, true))}
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
