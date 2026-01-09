'use client';

import { useMemo, useState } from 'react';
import { Box, Typography, Card, CardContent, Chip, Alert } from '@mui/material';
import ComputerIcon from '@mui/icons-material/Computer';
import PublicIcon from '@mui/icons-material/Public';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

type ServerSystemInfo = NonNullable<ReturnType<typeof getRuntimeConfig>['systemInfo']>;

type ClientSystemInfo = {
  userAgent: string;
  language: string;
  timeZone: string;
  platform: string;
  screen: string;
};

function collectClientInfo(): ClientSystemInfo {
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const plat = (navigator as unknown as { platform?: string }).platform ?? 'N/A';
  const scr = `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio || 1}x`;

  return { userAgent: ua, language: lang, timeZone: tz, platform: plat, screen: scr };
}

export default function SystemInfo() {
  const { systemInfo } = getRuntimeConfig();
  const [client] = useState<ClientSystemInfo | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return collectClientInfo();
    } catch {
      return null;
    }
  });

  const serverCards = useMemo(() => {
    const s = systemInfo as ServerSystemInfo | undefined;
    if (!s) return [];

    return [
      { label: 'Node.js', value: s.nodejs, chip: { label: 'Runtime', color: 'primary' as const } },
      { label: 'npm', value: s.npm, chip: { label: 'Package', color: 'primary' as const } },
      { label: 'Next.js', value: s.nextjs, chip: { label: 'Framework', color: 'secondary' as const } },
      { label: 'React', value: s.react, chip: { label: 'UI', color: 'secondary' as const } },
      { label: 'Material-UI', value: s.mui, chip: { label: 'Components', color: 'secondary' as const } },
      { label: 'TypeScript', value: s.typescript, chip: { label: 'Language', color: 'secondary' as const } },
      { label: 'Platform', value: s.platform, chip: { label: 'OS' } },
      { label: 'Architecture', value: s.arch, chip: { label: 'CPU' } },
    ];
  }, [systemInfo]);

  const clientCards = useMemo(() => {
    if (!client) return [];
    return [
      { label: 'Browser (UA)', value: client.userAgent, chip: { label: 'UA' } },
      { label: 'Language', value: client.language, chip: { label: 'Locale' } },
      { label: 'Timezone', value: client.timeZone, chip: { label: 'TZ' } },
      { label: 'Platform', value: client.platform, chip: { label: 'Navigator' } },
      { label: 'Screen', value: client.screen, chip: { label: 'Display' } },
    ];
  }, [client]);

  if (!systemInfo) {
    return <Alert severity="warning">Server system information is not available.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ComputerIcon /> System Information
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Server and client environment details
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
          mt: 2,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <ComputerIcon fontSize="small" /> Server
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
            {serverCards.map((c) => (
              <Card key={c.label} sx={{ height: '100%' }}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography color="text.secondary" variant="caption" gutterBottom>
                    {c.label}
                  </Typography>
                  <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
                    {c.value || 'N/A'}
                  </Typography>
                  <Chip size="small" sx={{ mt: 1 }} {...c.chip} />
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <PublicIcon fontSize="small" /> Client
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
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
              <Card key={c.label} sx={{ height: '100%' }}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography color="text.secondary" variant="caption" gutterBottom>
                    {c.label}
                  </Typography>
                  <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
                    {c.value || 'N/A'}
                  </Typography>
                  <Chip size="small" sx={{ mt: 1 }} {...c.chip} />
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
