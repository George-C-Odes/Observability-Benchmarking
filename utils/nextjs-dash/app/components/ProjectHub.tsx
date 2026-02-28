'use client';

import React, { useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Link,
  Grid,
  Divider,
  Chip,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import ApiIcon from '@mui/icons-material/Api';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GitHubIcon from '@mui/icons-material/GitHub';
import HubIcon from '@mui/icons-material/Hub';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import EmailIcon from '@mui/icons-material/Email';
import LinkedInIcon from '@mui/icons-material/LinkedIn';

function AuthorGearIcon({ size = 36 }: { size?: number }) {
  // Using the app favicon as a visual 'engineering' mark.
  // We rotate the image on card hover for a small flourish.
  return (
    <Box
      component="img"
      src="/favicon.svg"
      alt="Author"
      sx={{
        width: size,
        height: size,
        display: 'block',
        filter: 'drop-shadow(0px 2px 6px rgba(0,0,0,0.25))',
        // The SVG file contains an infinite spin animation by default.
        // We explicitly disable it here so we can control rotation only on hover.
        animation: 'none !important',
      }}
    />
  );
}

type HubResource = {
  title: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  badge?: string;
};

const SUPPLEMENTARY_DOCS_URL = 'https://george-c-odes.github.io/Observability-Benchmarking/';

function ResourceCard({ resource }: { resource: HubResource }) {
  return (
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
        <Box display="flex" alignItems="center" mb={2} gap={1}>
          {resource.icon}
          <Typography variant="h6" sx={{ ml: 0.5, flexGrow: 1 }}>
            {resource.title}
          </Typography>
          {resource.badge ? <Chip size="small" label={resource.badge} variant="outlined" /> : null}
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
  );
}

function Section({ title, resources }: { title: string; resources: HubResource[] }) {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        variant="h6"
        sx={{
          mb: 1,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          fontSize: '0.95rem',
        }}
        color="text.secondary"
      >
        {title}
      </Typography>

      <Grid container spacing={3} sx={{ mt: 0 }}>
        {resources.map((resource) => (
          <Grid size={{ xs: 12, sm: 6 }} key={resource.title}>
            <ResourceCard resource={resource} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/**
 * Project Hub component displaying useful links grouped by domain.
 */
export default function ProjectHub() {

  const author = {
    name: 'George Charalambous',
    email: 'georgecha@gmail.com',
    githubUrl: 'https://github.com/George-C-Odes',
    linkedInUrl: 'https://www.linkedin.com/in/george-charalambous-114648203/',
    tagline:
      'Benchmark workloads + telemetry pipelines, wired like production: repeatable, inspectable, and measurable.',
  };

  const orchestratorResources = useMemo<HubResource[]>(
    () => [
      {
        title: 'Swagger',
        description: 'Interactive Swagger UI for the Quarkus orchestrator service',
        url: 'http://localhost:3002/q/swagger-ui/',
        icon: <ApiIcon fontSize="large" color="primary" />,
      },
      {
        title: 'SmallRye Health UI',
        description: 'SmallRye Health UI for monitoring orchestrator health metrics',
        url: 'http://localhost:3002/q/health-ui/',
        icon: <HealthAndSafetyIcon fontSize="large" color="success" />,
      },
    ],
    []
  );

  const grafanaResources = useMemo<HubResource[]>(
    () => [
      {
        title: 'Grafana',
        description: 'Observability stack visualization and monitoring dashboards',
        url: 'http://localhost:3000',
        icon: <DashboardIcon fontSize="large" color="warning" />,
      },
      {
        title: 'Alloy',
        description: 'Grafana Alloy UI and configuration pages',
        url: 'http://localhost:12345/',
        icon: <SettingsEthernetIcon fontSize="large" color="info" />,
      },
      {
        title: 'Mimir',
        description: 'Mimir API/metrics endpoint for long-term metrics storage',
        url: 'http://localhost:9009/',
        icon: <StorageIcon fontSize="large" color="secondary" />,
      },
      {
        title: 'Pyroscope',
        description: 'Continuous profiling UI powered by Pyroscope',
        url: 'http://localhost:4040/',
        icon: <MemoryIcon fontSize="large" color="error" />,
      },
    ],
    []
  );

  const projectResources = useMemo<HubResource[]>(
    () => {
      const base: HubResource[] = [
        {
          title: 'GitHub Repository',
          description: 'Complete project source code and documentation',
          url: 'https://github.com/George-C-Odes/Observability-Benchmarking',
          icon: <GitHubIcon fontSize="large" color="inherit" />,
        },
        {
          title: 'Supplementary Documentation',
          description: 'Supplementary docs site',
          url: SUPPLEMENTARY_DOCS_URL,
          icon: <MenuBookIcon fontSize="large" color="primary" />,
        },
      ];

      return base;
    },
    []
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HubIcon /> Project Hub
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Quick access to orchestrator tools, observability UI endpoints, and project resources
      </Typography>

      <Section title="Orchestrator" resources={orchestratorResources} />
      <Section title="Grafana" resources={grafanaResources} />
      <Section title="Project" resources={projectResources} />

      <Divider sx={{ my: 4 }} />

      <Box sx={{ mt: 2 }}>
        <Typography
          variant="h6"
          sx={{
            mb: 1,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            fontSize: '0.95rem',
          }}
          color="text.secondary"
        >
          Author
        </Typography>

        <Grid container spacing={3} sx={{ mt: 0 }}>
          <Grid size={{ xs: 12 }}>
            <Card
              sx={{
                height: '100%',
                border: '1px solid',
                borderColor: 'divider',
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0.00) 100%)',
                transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                position: 'relative',
                overflow: 'hidden',
                // Subtle scanline/highlight sweep (hover only).
                // Kept intentionally minimal (low opacity + short duration).
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: -48,
                  left: '-35%',
                  width: '28%',
                  height: '220%',
                  pointerEvents: 'none',
                  opacity: 0,
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 45%, rgba(255,255,255,0.05) 60%, transparent 100%)',
                  transform: 'skewX(-18deg) translateX(0)',
                },
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 8,
                  borderColor: 'rgba(255,255,255,0.22)',
                },
                '&:hover::after': {
                  opacity: 1,
                  animation: 'authorSweep 900ms ease-out 1',
                },
                '@keyframes authorSweep': {
                  '0%': { transform: 'skewX(-18deg) translateX(-20%)', opacity: 0 },
                  '10%': { opacity: 0.55 },
                  '55%': { opacity: 0.22 },
                  '100%': { transform: 'skewX(-18deg) translateX(520%)', opacity: 0 },
                },
                // Rotate the gear only on hover.
                '&:hover .author-gear': {
                  transform: 'rotate(360deg)',
                },
                // Slightly brighten the accent when hovered.
                '&:hover .author-accent': {
                  opacity: 1,
                  filter: 'saturate(1.2)',
                },
              }}
            >
              <CardContent>
                {/* Accent strip + subtle overlay for a more 'serious' UI finish */}
                <Box
                  className="author-accent"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    opacity: 0.75,
                    background:
                      'linear-gradient(90deg, rgba(59,130,246,0.9) 0%, rgba(168,85,247,0.7) 55%, rgba(34,211,238,0.55) 100%)',
                    transition: 'opacity 180ms ease, filter 180ms ease',
                  }}
                />

                <Box
                  aria-hidden
                  sx={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.55,
                    background:
                      'radial-gradient(800px circle at 20% 10%, rgba(59,130,246,0.18), transparent 55%), radial-gradient(700px circle at 80% 30%, rgba(168,85,247,0.12), transparent 52%)',
                  }}
                />

                <Box
                  aria-hidden
                  sx={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.18,
                    backgroundImage:
                      'linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    maskImage: 'linear-gradient(to bottom, black, transparent 75%)',
                  }}
                />

                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    mb: 1.5,
                    position: 'relative',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      className="author-gear"
                      sx={{
                        transition: 'transform 650ms cubic-bezier(0.2, 0.9, 0.2, 1)',
                        transform: 'rotate(0deg)',
                      }}
                    >
                      <AuthorGearIcon />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                        {author.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {author.tagline}
                      </Typography>
                    </Box>
                  </Box>

                  <Chip size="small" label="Maintainer" variant="outlined" sx={{ position: 'relative' }} />
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', position: 'relative' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      alignItems: 'center',
                    }}
                  >
                    <Link
                      href={`mailto:${author.email}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="none"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 999,
                        border: '1px solid',
                        borderColor: 'divider',
                        color: 'text.secondary',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderColor: 'rgba(255,255,255,0.20)',
                          color: 'text.primary',
                        },
                        '&:active': {
                          transform: 'translateY(-1px)',
                        },
                      }}
                    >
                      <EmailIcon sx={{ fontSize: '1.05rem' }} />
                      <Typography variant="body2" component="span" sx={{ lineHeight: 1 }}>
                        Email
                      </Typography>
                    </Link>

                    <Link
                      href={author.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="none"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 999,
                        border: '1px solid',
                        borderColor: 'divider',
                        color: 'text.secondary',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderColor: 'rgba(255,255,255,0.20)',
                          color: 'text.primary',
                        },
                        '&:active': {
                          transform: 'translateY(-1px)',
                        },
                      }}
                    >
                      <LinkedInIcon sx={{ fontSize: '1.05rem' }} />
                      <Typography variant="body2" component="span" sx={{ lineHeight: 1 }}>
                        LinkedIn
                      </Typography>
                    </Link>

                    <Link
                      href={author.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="none"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 999,
                        border: '1px solid',
                        borderColor: 'divider',
                        color: 'text.secondary',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        transition: 'transform 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderColor: 'rgba(255,255,255,0.20)',
                          color: 'text.primary',
                        },
                        '&:active': {
                          transform: 'translateY(-1px)',
                        },
                      }}
                    >
                      <GitHubIcon sx={{ fontSize: '1.05rem' }} />
                      <Typography variant="body2" component="span" sx={{ lineHeight: 1 }}>
                        GitHub
                      </Typography>
                    </Link>
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    This dashboard provides a unified interface for managing and monitoring observability
                    benchmarking workloads across Spring Boot, Quarkus, Spark, Javalin, Micronaut, Helidon and Go services with comprehensive
                    telemetry integration (Grafana, Alloy, Loki, Mimir, Tempo, Pyroscope).
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
