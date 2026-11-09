'use client';

import type { RefObject } from 'react';
import { Box, Button, Card, CardContent, Chip, Collapse, Tooltip, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ListAltIcon from '@mui/icons-material/ListAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export function ExecutionLogs({
  sseConnected,
  showStreamIssueChip,
  reconnectCount,
  showEventLogs,
  statusPulseOn,
  maxExecutionLogLines,
  eventLogs,
  executionLogRef,
  clearEventLogs,
  onReset,
  onToggle,
}: {
  sseConnected: boolean;
  showStreamIssueChip: boolean;
  reconnectCount: number;
  showEventLogs: boolean;
  statusPulseOn: boolean;
  maxExecutionLogLines: number;
  eventLogs: string[];
  executionLogRef: RefObject<HTMLDivElement | null>;
  clearEventLogs: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ListAltIcon />
            <Typography variant="h6">Execution Logs</Typography>
            <Chip
              size="small"
              label={sseConnected ? 'SSE Connected' : 'SSE Disconnected'}
              color={sseConnected ? 'success' : 'default'}
              icon={
                sseConnected ? (
                  <CheckCircleIcon fontSize="small" />
                ) : (
                  <LinkOffIcon fontSize="small" />
                )
              }
              variant="outlined"
            />
            {showStreamIssueChip && (
              <Chip
                size="small"
                label={`Stream issue${reconnectCount ? ` (${reconnectCount})` : ''}`}
                color="warning"
                icon={<WarningAmberIcon fontSize="small" />}
                variant="outlined"
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Reset execution state (clears logs, status, and active job)">
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<ClearAllIcon />}
                onClick={onReset}
              >
                Clear
              </Button>
            </Tooltip>

            <Tooltip title={showEventLogs ? 'Hide execution logs' : 'Show execution logs'}>
              <Button
                size="small"
                variant={showEventLogs ? 'contained' : 'outlined'}
                startIcon={showEventLogs ? <VisibilityOffIcon /> : <VisibilityIcon />}
                onClick={() => onToggle()}
                sx={{
                  '@keyframes logsPulse': {
                    '0%': { boxShadow: '0 0 0 rgba(255,193,7,0.0)' },
                    '35%': { boxShadow: '0 0 0 6px rgba(255,193,7,0.18)' },
                    '100%': { boxShadow: '0 0 0 rgba(255,193,7,0.0)' },
                  },
                  animation: statusPulseOn ? 'logsPulse 650ms ease-in-out' : 'none',
                }}
              >
                {showEventLogs ? 'Hide' : 'Show'}
              </Button>
            </Tooltip>

            <Tooltip title={`Keep last ${maxExecutionLogLines} lines`}>
              <Chip size="small" label={`${eventLogs.length} lines`} variant="outlined" />
            </Tooltip>
          </Box>
        </Box>

        <Collapse in={showEventLogs} timeout={250}>
          <Box
            ref={executionLogRef}
            sx={{
              mt: 1,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'grey.900',
              color: 'grey.100',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid',
              borderColor: 'divider',
              transition: 'max-height 250ms ease',
            }}
          >
            {eventLogs.join('\n') || '—'}
          </Box>

          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" variant="outlined" onClick={clearEventLogs} sx={{ mr: 1 }}>
              Clear Text
            </Button>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
