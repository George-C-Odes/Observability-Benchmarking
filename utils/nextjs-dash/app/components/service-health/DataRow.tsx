'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';

export interface DataRowProps {
  label: string;
  value: React.ReactNode;
  color?: 'default' | 'secondary' | 'error';
  endAdornment?: React.ReactNode;
}

/**
 * A single data-display row inside a ServiceHealth card.
 *
 * Extracted from ServiceHealth.tsx and wrapped with React.memo.
 */
export const DataRow = React.memo(function DataRow(props: DataRowProps) {
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      sx={{
        minHeight: 22,
        py: 0.125,
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          width: 64,
          color: 'text.secondary',
          fontWeight: 600,
          lineHeight: 1.2,
          flex: '0 0 auto',
        }}
      >
        {props.label}
      </Typography>

      <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
        <Typography
          variant="caption"
          sx={{
            color: props.color === 'error' ? 'error.main' : props.color === 'secondary' ? 'text.secondary' : 'text.primary',
            lineHeight: 1.2,
            wordBreak: 'break-word',
          }}
        >
          {props.value}
        </Typography>
      </Box>

      {props.endAdornment && (
        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>{props.endAdornment}</Box>
      )}
    </Box>
  );
});