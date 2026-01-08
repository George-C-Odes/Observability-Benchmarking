'use client';

import {
  Box,
  Card,
  CardContent,
  Typography,
  Link,
  Grid,
  Alert,
  Divider,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import ApiIcon from '@mui/icons-material/Api';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';

/**
 * Resources component displaying useful links and project information.
 * Follows Single Responsibility Principle - only handles resource display.
 */
export default function Resources() {
  const resources = [
    {
      title: 'Orchestrator API Documentation',
      description: 'Interactive Swagger UI for the Quarkus orchestrator service',
      url: 'http://localhost:3002/q/swagger-ui/',
      icon: <ApiIcon fontSize="large" color="primary" />,
    },
    {
      title: 'Orchestrator Health Dashboard',
      description: 'SmallRye Health UI for monitoring orchestrator health metrics',
      url: 'http://localhost:3002/q/health-ui/',
      icon: <HealthAndSafetyIcon fontSize="large" color="success" />,
    },
    {
      title: 'Grafana Dashboard',
      description: 'Observability stack visualization and monitoring dashboards',
      url: 'http://localhost:3000',
      icon: <DashboardIcon fontSize="large" color="warning" />,
    },
    {
      title: 'GitHub Repository',
      description: 'Complete project source code and documentation',
      url: 'https://github.com/George-C-Odes/Observability-Benchmarking',
      icon: <GitHubIcon fontSize="large" color="inherit" />,
    },
  ];

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MenuBookIcon /> Resources & Documentation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Quick access to related tools, APIs, and project information
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {resources.map((resource) => (
          <Grid size={{ xs: 12, sm: 6 }} key={resource.title}>
            <Card
              sx={{
                height: '100%',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6,
                },
              }}
            >
              <CardContent>
                <Box display="flex" alignItems="center" mb={2}>
                  {resource.icon}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {resource.title}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {resource.description}
                </Typography>
                <Link
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  Open
                  <LaunchIcon sx={{ ml: 0.5, fontSize: '1rem' }} />
                </Link>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Observability Benchmarking Dashboard</strong>
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Created by <strong>George Charalambous</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Email:{' '}
          <Link
            href="mailto:georgecha@gmail.com"
            sx={{ color: 'inherit', textDecoration: 'underline' }}
          >
            georgecha@gmail.com
          </Link>
        </Typography>
      </Alert>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        This dashboard provides a unified interface for managing and monitoring observability
        benchmarking workloads across Spring Boot, Quarkus, and Go services with comprehensive
        telemetry integration (Grafana, Alloy, Loki, Mimir, Tempo, Pyroscope).
      </Typography>
    </Box>
  );
}
