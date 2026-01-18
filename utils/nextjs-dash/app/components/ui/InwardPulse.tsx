'use client';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export type InwardPulseProps = {
  /** Controls whether the pulse animation is active. */
  active: boolean;
  /** Border color of the pulse ring. */
  color: string;
  /**
   * Inset (negative) distance around the anchor.
   * Similar to the ScriptRunner terminal chip pulse.
   */
  inset?: number;
  /** Border radius applied to the pulse ring. */
  borderRadius?: number | string;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Optional extra sx for the pulse ring box. */
  sx?: SxProps<Theme>;
};

/**
 * Reusable "inward closing" pulse ring.
 *
 * Usage: place inside a relatively-positioned container.
 */
export function InwardPulse({
  active,
  color,
  inset = 12,
  borderRadius = 16,
  durationMs = 1000,
  sx,
}: InwardPulseProps) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: -inset,
        borderRadius,
        border: `2px solid ${color}`,
        opacity: active ? 1 : 0,
        animation: active ? `inwardPulse ${durationMs}ms ease-in-out` : 'none',
        pointerEvents: 'none',
        filter: 'blur(0.2px)',
        '@keyframes inwardPulse': {
          '0%': { transform: 'scale(2.6)', opacity: 0.0 },
          '18%': { transform: 'scale(2.25)', opacity: 0.38 },
          '45%': { transform: 'scale(1.55)', opacity: 0.52 },
          '75%': { transform: 'scale(1.12)', opacity: 0.32 },
          '100%': { transform: 'scale(1.0)', opacity: 0.0 },
        },
        ...sx,
      }}
    />
  );
}
