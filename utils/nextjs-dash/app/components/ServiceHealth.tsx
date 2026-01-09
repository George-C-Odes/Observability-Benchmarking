'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import { fetchJson } from '@/lib/fetchJson';

interface ServiceHealth {
  name: string;
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
}

export default function ServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAllServices = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchJson<{ services?: ServiceHealth[] }>(`/api/health`);
      setServices(data.services || []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to check service health (dashboard backend unreachable)' });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshService = useCallback(async (serviceName: string) => {
    setRefreshing(serviceName);
    try {
      const data = await fetchJson<{ services?: ServiceHealth[] }>(`/api/health?service=${encodeURIComponent(serviceName)}`);
      const single = Array.isArray(data?.services) && data.services.length ? data.services[0] : null;

      if (single) {
        setServices((prev) => prev.map((s) => (s.name === serviceName ? single : s)));
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(null);
    }
  }, []);

  useEffect(() => {
    void fetchAllServices();
  }, [fetchAllServices]);

  const groupedServices = {
    observability: services.filter(s => 
      ['grafana', 'alloy', 'loki', 'mimir', 'tempo', 'pyroscope'].includes(s.name)
    ),
    spring: services.filter(s => s.name.startsWith('spring-')),
    quarkus: services.filter(s => s.name.startsWith('quarkus-')),
    go: services.filter(s => s.name.startsWith('go')),
    utils: services.filter(s =>
      ['wrk2', 'orchestrator'].includes(s.name)
    ),
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

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
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={fetchAllServices}
          disabled={loading}
        >
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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        {groupedServices.observability.map((service) => (
          <Card key={service.name}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" component="div">
                  {service.name}
                </Typography>
                {service.status === 'up' ? (
                  <CheckCircleIcon color="success" />
                ) : (
                  <CancelIcon color="error" />
                )}
              </Box>
              <Chip
                label={service.status.toUpperCase()}
                color={service.status === 'up' ? 'success' : 'error'}
                size="small"
                sx={{ mt: 1 }}
              />
              {service.responseTime && (
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Response: {service.responseTime}ms
                </Typography>
              )}
              {service.error && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                  {service.error}
                </Typography>
              )}
            </CardContent>
            <CardActions>
              <Tooltip title="Refresh this service">
                <IconButton
                  size="small"
                  onClick={() => refreshService(service.name)}
                  disabled={refreshing === service.name}
                >
                  {refreshing === service.name ? (
                    <CircularProgress size={20} />
                  ) : (
                    <RefreshIcon />
                  )}
                </IconButton>
              </Tooltip>
            </CardActions>
          </Card>
        ))}
      </Box>

      {/* Spring Services */}
      {groupedServices.spring.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Spring Services
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {groupedServices.spring.map((service) => (
              <Card key={service.name}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="div" fontSize="0.9rem">
                      {service.name}
                    </Typography>
                    {service.status === 'up' ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <CancelIcon color="error" />
                    )}
                  </Box>
                  <Chip
                    label={service.status.toUpperCase()}
                    color={service.status === 'up' ? 'success' : 'error'}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                  {service.responseTime && (
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      Response: {service.responseTime}ms
                    </Typography>
                  )}
                  {service.error && (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                      {service.error}
                    </Typography>
                  )}
                </CardContent>
                <CardActions>
                  <Tooltip title="Refresh this service">
                    <IconButton
                      size="small"
                      onClick={() => refreshService(service.name)}
                      disabled={refreshing === service.name}
                    >
                      {refreshing === service.name ? (
                        <CircularProgress size={20} />
                      ) : (
                        <RefreshIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {/* Quarkus Services */}
      {groupedServices.quarkus.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Quarkus Services
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {groupedServices.quarkus.map((service) => (
              <Card key={service.name}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" component="div">
                      {service.name}
                    </Typography>
                    {service.status === 'up' ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <CancelIcon color="error" />
                    )}
                  </Box>
                  <Chip
                    label={service.status.toUpperCase()}
                    color={service.status === 'up' ? 'success' : 'error'}
                    size="small"
                    sx={{ mt: 1 }}
                  />
                  {service.responseTime && (
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      Response: {service.responseTime}ms
                    </Typography>
                  )}
                  {service.error && (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                      {service.error}
                    </Typography>
                  )}
                </CardContent>
                <CardActions>
                  <Tooltip title="Refresh this service">
                    <IconButton
                      size="small"
                      onClick={() => refreshService(service.name)}
                      disabled={refreshing === service.name}
                    >
                      {refreshing === service.name ? (
                        <CircularProgress size={20} />
                      ) : (
                        <RefreshIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {/* Go Services */}
      {groupedServices.go.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Go Services
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {groupedServices.go.map((service) => (
                <Card key={service.name}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="h6" component="div">
                        {service.name}
                      </Typography>
                      {service.status === 'up' ? (
                          <CheckCircleIcon color="success" />
                      ) : (
                          <CancelIcon color="error" />
                      )}
                    </Box>
                    <Chip
                        label={service.status.toUpperCase()}
                        color={service.status === 'up' ? 'success' : 'error'}
                        size="small"
                        sx={{ mt: 1 }}
                    />
                    {service.responseTime && (
                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                          Response: {service.responseTime}ms
                        </Typography>
                    )}
                    {service.error && (
                        <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                          {service.error}
                        </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Tooltip title="Refresh this service">
                      <IconButton
                          size="small"
                          onClick={() => refreshService(service.name)}
                          disabled={refreshing === service.name}
                      >
                        {refreshing === service.name ? (
                            <CircularProgress size={20} />
                        ) : (
                            <RefreshIcon />
                        )}
                      </IconButton>
                    </Tooltip>
                  </CardActions>
                </Card>
            ))}
          </Box>
        </>
      )}

      {/* Utils */}
      {groupedServices.utils.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Utils
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {groupedServices.utils.map((service) => (
                <Card key={service.name}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="h6" component="div">
                        {service.name}
                      </Typography>
                      {service.status === 'up' ? (
                          <CheckCircleIcon color="success" />
                      ) : (
                          <CancelIcon color="error" />
                      )}
                    </Box>
                    <Chip
                        label={service.status.toUpperCase()}
                        color={service.status === 'up' ? 'success' : 'error'}
                        size="small"
                        sx={{ mt: 1 }}
                    />
                    {service.responseTime && (
                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                          Response: {service.responseTime}ms
                        </Typography>
                    )}
                    {service.error && (
                        <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                          {service.error}
                        </Typography>
                    )}
                  </CardContent>
                  <CardActions>
                    <Tooltip title="Refresh this service">
                      <IconButton
                          size="small"
                          onClick={() => refreshService(service.name)}
                          disabled={refreshing === service.name}
                      >
                        {refreshing === service.name ? (
                            <CircularProgress size={20} />
                        ) : (
                            <RefreshIcon />
                        )}
                      </IconButton>
                    </Tooltip>
                  </CardActions>
                </Card>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}