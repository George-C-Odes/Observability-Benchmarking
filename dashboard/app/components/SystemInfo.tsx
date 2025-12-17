'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Alert,
  Chip,
} from '@mui/material';
import ComputerIcon from '@mui/icons-material/Computer';

interface SystemInfoData {
  nodejs: string;
  npm: string;
  nextjs: string;
  react: string;
  mui: string;
  typescript: string;
  platform: string;
  arch: string;
}

export default function SystemInfo() {
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSystemInfo();
  }, []);

  const fetchSystemInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/system');
      if (!response.ok) throw new Error('Failed to fetch system info');
      const data = await response.json();
      setSystemInfo(data);
    } catch (err) {
      setError('Failed to load system information');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ComputerIcon /> System Information
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Framework and library versions currently in use
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mt: 3 }}>
        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Node.js
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.nodejs || 'N/A'}
            </Typography>
            <Chip label="Runtime" size="small" color="primary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              npm
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.npm || 'N/A'}
            </Typography>
            <Chip label="Package Manager" size="small" color="primary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Next.js
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.nextjs || 'N/A'}
            </Typography>
            <Chip label="Framework" size="small" color="secondary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              React
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.react || 'N/A'}
            </Typography>
            <Chip label="UI Library" size="small" color="secondary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Material-UI
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.mui || 'N/A'}
            </Typography>
            <Chip label="Component Library" size="small" color="secondary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              TypeScript
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.typescript || 'N/A'}
            </Typography>
            <Chip label="Language" size="small" color="secondary" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Platform
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.platform || 'N/A'}
            </Typography>
            <Chip label="OS" size="small" sx={{ mt: 1 }} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography color="text.secondary" gutterBottom>
              Architecture
            </Typography>
            <Typography variant="h5" component="div">
              {systemInfo?.arch || 'N/A'}
            </Typography>
            <Chip label="CPU" size="small" sx={{ mt: 1 }} />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
