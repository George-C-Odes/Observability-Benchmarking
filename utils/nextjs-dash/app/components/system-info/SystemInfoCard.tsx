'use client';

import React from 'react';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ChipProps } from '@mui/material';

interface SystemInfoCardData {
  label: string;
  value?: string;
  chip: Pick<ChipProps, 'label' | 'color'>;
  icon: React.ReactNode;
}

/** Shared presentation for server and browser system facts. */
export const SystemInfoCard = React.memo(function SystemInfoCard({
  label,
  value,
  chip,
  icon,
}: SystemInfoCardData) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>{icon}</Box>
          <Typography color="text.secondary" variant="caption">
            {label}
          </Typography>
        </Stack>
        <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
          {value || 'N/A'}
        </Typography>
        <Chip size="small" sx={{ mt: 1 }} {...chip} />
      </CardContent>
    </Card>
  );
});
