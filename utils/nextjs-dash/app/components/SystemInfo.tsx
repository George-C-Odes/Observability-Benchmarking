'use client';

import { useMemo, useState } from 'react';
import { Box, Typography, Card, CardContent, Alert, Stack, Divider } from '@mui/material';
import ComputerIcon from '@mui/icons-material/Computer';
import MemoryIcon from '@mui/icons-material/Memory';
import CodeIcon from '@mui/icons-material/Code';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import LanguageIcon from '@mui/icons-material/Language';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StraightenIcon from '@mui/icons-material/Straighten';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PublicIcon from '@mui/icons-material/Public';
import { getRuntimeConfig } from '@/lib/runtimeConfig';
import {
  collectClientSystemInfo,
  type ClientSystemInfo,
  type ServerSystemInfo,
} from '@/lib/systemInfo';
import { SystemInfoCard } from '@/app/components/system-info/SystemInfoCard';

const INFO_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
  gap: 1.5,
} as const;

const INFO_SECTION_HEADING_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 1,
} as const;

export default function SystemInfo() {
  const { systemInfo } = getRuntimeConfig();
  const [client] = useState<ClientSystemInfo | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return collectClientSystemInfo();
    } catch {
      return null;
    }
  });

  const serverCards = useMemo(() => {
    const s = systemInfo as ServerSystemInfo | undefined;
    if (!s) return [];

    return [
      {
        label: 'Node.js',
        value: s.nodejs,
        chip: { label: 'Runtime', color: 'primary' as const },
        icon: <MemoryIcon fontSize="small" />,
      },
      {
        label: 'npm',
        value: s.npm,
        chip: { label: 'Package', color: 'primary' as const },
        icon: <CodeIcon fontSize="small" />,
      },
      {
        label: 'Next.js',
        value: s.nextjs,
        chip: { label: 'Framework', color: 'secondary' as const },
        icon: <ViewWeekIcon fontSize="small" />,
      },
      {
        label: 'React',
        value: s.react,
        chip: { label: 'UI', color: 'secondary' as const },
        icon: <ViewWeekIcon fontSize="small" />,
      },
      {
        label: 'Material-UI',
        value: s.mui,
        chip: { label: 'Components', color: 'secondary' as const },
        icon: <ViewWeekIcon fontSize="small" />,
      },
      {
        label: 'TypeScript',
        value: s.typescript,
        chip: { label: 'Language', color: 'secondary' as const },
        icon: <CodeIcon fontSize="small" />,
      },
      {
        label: 'Platform',
        value: s.platform,
        chip: { label: 'OS' },
        icon: <ComputerIcon fontSize="small" />,
      },
      {
        label: 'Architecture',
        value: s.arch,
        chip: { label: 'CPU' },
        icon: <MemoryIcon fontSize="small" />,
      },
    ];
  }, [systemInfo]);

  const clientCards = useMemo(() => {
    if (!client) return [];
    return [
      {
        label: 'Browser (UA)',
        value: client.userAgent,
        chip: { label: 'UA' },
        icon: <PublicIcon fontSize="small" />,
      },
      {
        label: 'Language',
        value: client.language,
        chip: { label: 'Locale' },
        icon: <LanguageIcon fontSize="small" />,
      },
      {
        label: 'Timezone',
        value: client.timeZone,
        chip: { label: 'TZ' },
        icon: <AccessTimeIcon fontSize="small" />,
      },
      {
        label: 'Platform',
        value: client.platform,
        chip: { label: 'UA-CH' },
        icon: <ComputerIcon fontSize="small" />,
      },
      {
        label: 'Screen',
        value: client.screen,
        chip: { label: 'Display' },
        icon: <StraightenIcon fontSize="small" />,
      },
    ];
  }, [client]);

  if (!systemInfo) {
    return <Alert severity="warning">Server system information is not available.</Alert>;
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <InfoOutlinedIcon color="primary" />
        <Typography variant="h5">System Information</Typography>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          mt: 1,
        }}
      >
        <Box>
          <Typography variant="h6" sx={INFO_SECTION_HEADING_SX}>
            <ComputerIcon fontSize="small" /> Server
          </Typography>
          <Box sx={INFO_GRID_SX}>
            {serverCards.map((c) => (
              <SystemInfoCard key={c.label} {...c} />
            ))}
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={INFO_SECTION_HEADING_SX}>
            <PublicIcon fontSize="small" /> Client
          </Typography>
          <Box sx={INFO_GRID_SX}>
            {!client && (
              <Card>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography color="text.secondary" variant="caption" gutterBottom>
                    Loading
                  </Typography>
                  <Typography variant="body1">Collecting client info…</Typography>
                </CardContent>
              </Card>
            )}
            {clientCards.map((c) => (
              <SystemInfoCard key={c.label} {...c} />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
