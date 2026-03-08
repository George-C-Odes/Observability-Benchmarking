'use client';

import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export interface ActionRowProps {
  label: string;
  ariaLabel: string;
  tooltipCommand: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  disabledReason?: string;
  kind?: 'refresh' | 'normal';
}

/**
 * A single action row inside a ServiceHealth card.
 *
 * Extracted from ServiceHealth.tsx so it is:
 *  1. Defined once at module scope (not re-created every render).
 *  2. Wrapped with React.memo to skip re-renders when props are unchanged.
 */
export const ActionRow = React.memo(function ActionRow(props: ActionRowProps) {
  const isDelete = props.ariaLabel === 'Delete';
  const isRefresh = props.kind === 'refresh';

  const tooltip = (
    <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
      {props.tooltipCommand}
      {props.disabledReason ? `\n\n⚠ ${props.disabledReason}` : ''}
    </Box>
  );

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      sx={{
        minHeight: 22,
        ...(isRefresh
          ? {
              borderRadius: 1,
              px: 0.5,
              py: 0.25,
              backgroundColor: 'rgba(25, 118, 210, 0.06)',
            }
          : undefined),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          width: 64,
          color: props.disabled ? 'text.disabled' : isRefresh ? 'primary.main' : 'text.secondary',
          fontWeight: isRefresh ? 800 : 600,
          lineHeight: 1.2,
        }}
      >
        {props.label}
      </Typography>
      <Tooltip disableInteractive placement="left" title={tooltip}>
        <span>
          <IconButton
            aria-label={props.ariaLabel}
            type="button"
            size="small"
            sx={{
              width: 28,
              height: 28,
              p: 0.5,
              color: isDelete ? 'error.main' : undefined,
            }}
            onClick={props.onClick}
            disabled={props.disabled}
          >
            {props.icon}
          </IconButton>
        </span>
      </Tooltip>
      {props.disabledReason && (
        <Tooltip title={props.disabledReason}>
          <WarningAmberIcon fontSize="small" sx={{ color: 'warning.main', opacity: 0.9 }} />
        </Tooltip>
      )}
    </Box>
  );
});