'use client';

import React from 'react';
import type { ServiceHealth as ServiceHealthData } from '@/lib/serviceHealthModel';
import { useServiceHealth } from '@/app/hooks/useServiceHealth';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Alert,
  Tooltip,
  Stack,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import PendingIcon from '@mui/icons-material/Pending';
import AppsIcon from '@mui/icons-material/Apps';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BoltIcon from '@mui/icons-material/Bolt';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { buildDockerControlCommand } from '@/lib/dockerComposeControl';
import { ActionRow } from './service-health/ActionRow';
import { DataRow } from './service-health/DataRow';
import { ServiceGroup } from './service-health/ServiceGroup';

function ServiceResponseData({ service }: { service: ServiceHealthData }) {
  return (
    <Box sx={{ mt: 0.5, minWidth: 0 }}>
      {service.baseUrl && <DataRow label="Base URL" value={service.baseUrl} />}

      {typeof service.responseTime === 'number' && (
        <DataRow label="Response" value={`${service.responseTime}ms`} />
      )}

      {service.error && <DataRow label="Error" value={service.error} color="error" />}

      {service.body !== undefined && (
        <DataRow
          label="Body"
          color="secondary"
          value={
            <Tooltip
              title={
                <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', maxWidth: 500 }}>
                  {typeof service.body === 'string'
                    ? service.body
                    : JSON.stringify(service.body, null, 2)}
                </Box>
              }
              placement="bottom-start"
            >
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ cursor: 'help', lineHeight: 1.2 }}
              >
                Response body (hover)
              </Typography>
            </Tooltip>
          }
        />
      )}
    </Box>
  );
}

function getStatusUI(status: ServiceHealthData['status']): {
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

function isObsCoreServiceName(serviceName: string): boolean {
  return ['alloy', 'grafana', 'loki', 'mimir', 'pyroscope', 'tempo'].includes(serviceName);
}

export default function ServiceHealth() {
  const {
    dismissMessage,
    lastUpdatedAt,
    countsPulseKey,
    loading,
    refreshing,
    submitting,
    message,
    serviceActionsCfg,
    statusCounts,
    countsPulseOn,
    updatedFlashOn,
    lastUpdatedText,
    fetchAllServices,
    refreshService,
    submitDockerControl,
    groupedServices,
  } = useServiceHealth();

  if (loading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const renderServiceCard = (service: ServiceHealthData) => {
    const statusUI = getStatusUI(service.status);
    const isBusy = refreshing.has(service.name) || submitting === service.name;

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

    const upstreamHealthUrl = `/api/health?service=${encodeURIComponent(service.name)}`;

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
      action: 'recreate',
    });
    const deleteCommand = buildDockerControlCommand({
      service: service.name,
      action: 'delete',
    });

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
                <Box sx={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}>
                  {statusUI.icon}
                </Box>
                <Typography
                  variant="subtitle1"
                  component="div"
                  sx={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    width: '100%',
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
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Status
                </Typography>
                <Chip label={statusUI.label} color={statusUI.color} size="small" />
              </Box>

              <ServiceResponseData service={service} />
            </Box>

            {/* Actions section (stacks below on xs, right column on md+) */}
            <Stack
              direction="column"
              spacing={0}
              sx={{
                alignItems: 'stretch',
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
                icon={
                  refreshing.has(service.name) ? (
                    <CircularProgress size={18} />
                  ) : (
                    <RefreshIcon fontSize="small" />
                  )
                }
                kind="refresh"
              />

              {canStart && (
                <ActionRow
                  label="Start"
                  ariaLabel="Start"
                  tooltipCommand={startCommand}
                  onClick={() =>
                    submitDockerControl(
                      service.name,
                      { service: service.name, action: 'start' },
                      'start',
                    )
                  }
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
                    onClick={() =>
                      submitDockerControl(
                        service.name,
                        { service: service.name, action: 'restart' },
                        'restart',
                      )
                    }
                    disabled={isBusy || !canRestartAction}
                    disabledReason={!actionFlags.restart ? featureDisabledReason : undefined}
                    icon={<RestartAltIcon fontSize="small" color="primary" />}
                  />

                  <ActionRow
                    label="Stop"
                    ariaLabel="Stop"
                    tooltipCommand={stopCommand}
                    onClick={() =>
                      submitDockerControl(
                        service.name,
                        { service: service.name, action: 'stop' },
                        'stop',
                      )
                    }
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
                          { service: service.name, action: 'recreate' },
                          'recreate',
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
                      submitDockerControl(
                        service.name,
                        { service: service.name, action: 'delete' },
                        'delete',
                      )
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography
            variant="h5"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
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
              /api/health
            </Box>
          }
        >
          <span>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={fetchAllServices}
              disabled={loading}
            >
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, max-content)',
                md: 'repeat(4, max-content)',
              },
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
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ fontWeight: 900, letterSpacing: 0.7 }}
                  >
                    UP
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ opacity: 0.9, textAlign: 'center' }}
                  >
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
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ fontWeight: 900, letterSpacing: 0.7 }}
                  >
                    DOWN
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ opacity: 0.9, textAlign: 'center' }}
                  >
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
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ fontWeight: 900, letterSpacing: 0.7 }}
                  >
                    PENDING
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ opacity: 0.9, textAlign: 'center' }}
                  >
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
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ fontWeight: 900, letterSpacing: 0.7 }}
                  >
                    TOTAL
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ opacity: 0.9, textAlign: 'center' }}
                  >
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
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={dismissMessage}>
          {message.text}
        </Alert>
      )}

      {/* Observability Stack */}
      <ServiceGroup title="Observability Stack">
        {groupedServices.observability.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Spring Services" visible={groupedServices.spring.length > 0}>
        {groupedServices.spring.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Quarkus Services" visible={groupedServices.quarkus.length > 0}>
        {groupedServices.quarkus.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Micronaut Services" visible={groupedServices.micronaut.length > 0}>
        {groupedServices.micronaut.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Helidon Services" visible={groupedServices.helidon.length > 0}>
        {groupedServices.helidon.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Spark Services" visible={groupedServices.spark.length > 0}>
        {groupedServices.spark.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Javalin Services" visible={groupedServices.javalin.length > 0}>
        {groupedServices.javalin.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Dropwizard Services" visible={groupedServices.dropwizard.length > 0}>
        {groupedServices.dropwizard.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Vert.x Services" visible={groupedServices.vertx.length > 0}>
        {groupedServices.vertx.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Pekko Services" visible={groupedServices.pekko.length > 0}>
        {groupedServices.pekko.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Go Services" visible={groupedServices.go.length > 0}>
        {groupedServices.go.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Django Services" visible={groupedServices.django.length > 0}>
        {groupedServices.django.map((service) => renderServiceCard(service))}
      </ServiceGroup>

      <ServiceGroup title="Utils" visible={groupedServices.utils.length > 0}>
        {groupedServices.utils.map((service) => renderServiceCard(service))}
      </ServiceGroup>
    </Box>
  );
}
