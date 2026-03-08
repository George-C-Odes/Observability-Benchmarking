'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';

interface ServiceGroupProps {
  title: string;
  children: React.ReactNode;
  /** Hide the group entirely when there are no children to show. */
  visible?: boolean;
}

const SERVICE_GRID_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
  gap: 2,
  mb: 3,
} as const;

/**
 * Reusable wrapper for a labelled service-card grid in the ServiceHealth page.
 *
 * Eliminates the ~20 lines of JSX that were copy-pasted for every service
 * category (Observability, Spring, Quarkus, etc.), reducing duplication and
 * making it trivial to add new groups in the future (Open-Closed Principle).
 */
export const ServiceGroup = React.memo(function ServiceGroup({ title, children, visible = true }: ServiceGroupProps) {
  if (!visible) return null;

  return (
    <>
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        {title}
      </Typography>
      <Box sx={SERVICE_GRID_SX}>{children}</Box>
    </>
  );
});