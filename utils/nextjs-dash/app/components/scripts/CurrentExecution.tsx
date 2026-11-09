'use client';

import type { JobStatus } from '@/app/hooks/useJobRunner';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PendingIcon from '@mui/icons-material/Pending';
import TerminalIcon from '@mui/icons-material/Terminal';
import { InwardPulse } from '../ui/InwardPulse';

function formatTimestampHuman(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function CurrentExecution({
  lastJobStatus,
  runtimeNowMs,
  eventLogs,
  terminalPulseOn,
  statusPulseOn,
  sseConnected,
  currentJobId,
  isTerminal,
  sseLastError,
  reconnectCount,
  jobCommandText,
  jobTitleText,
  copyText,
  isRunning,
}: {
  lastJobStatus: JobStatus | null;
  runtimeNowMs: number;
  eventLogs: string[];
  terminalPulseOn: boolean;
  statusPulseOn: boolean;
  sseConnected: boolean;
  currentJobId: string | null;
  isTerminal: boolean;
  sseLastError: string | null;
  reconnectCount: number;
  jobCommandText: string;
  jobTitleText: string;
  copyText: (text: string) => Promise<void>;
  isRunning: boolean;
}) {
  const pageJob = lastJobStatus;
  const pageStatusUi = (() => {
    const st = pageJob?.status;
    if (!st)
      return { label: '—', color: 'default' as const, icon: <PendingIcon fontSize="small" /> };
    if (st === 'SUCCEEDED')
      return {
        label: 'SUCCEEDED',
        color: 'success' as const,
        icon: <CheckCircleIcon fontSize="small" />,
      };
    if (st === 'FAILED')
      return {
        label: 'FAILED',
        color: 'error' as const,
        icon: <ErrorOutlineIcon fontSize="small" />,
      };
    if (st === 'CANCELED')
      return { label: 'CANCELED', color: 'error' as const, icon: <CancelIcon fontSize="small" /> };
    if (st === 'RUNNING')
      return { label: 'RUNNING', color: 'warning' as const, icon: <CircularProgress size={14} /> };
    if (st === 'QUEUED')
      return { label: 'QUEUED', color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
    return { label: st, color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
  })();

  const statusPulseColor = (() => {
    if (pageStatusUi.color === 'success') return '#2e7d32';
    if (pageStatusUi.color === 'error') return '#d32f2f';
    if (pageStatusUi.color === 'warning') return '#ed6c02';
    return '#90a4ae';
  })();

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 260 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon fontSize="small" /> Current Execution
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Status:
              </Typography>

              <Box
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  borderRadius: 16,
                }}
              >
                <InwardPulse
                  active={terminalPulseOn}
                  color={statusPulseColor}
                  inset={12}
                  borderRadius={22}
                  durationMs={1000}
                />

                <Chip
                  size="small"
                  color={pageStatusUi.color}
                  icon={pageStatusUi.icon}
                  label={pageStatusUi.label}
                  sx={{
                    fontWeight: 'bold',
                    '@keyframes logsPulse': {
                      '0%': { boxShadow: '0 0 0 rgba(255,193,7,0.0)' },
                      '35%': { boxShadow: '0 0 0 6px rgba(255,193,7,0.18)' },
                      '100%': { boxShadow: '0 0 0 rgba(255,193,7,0.0)' },
                    },
                    animation: statusPulseOn ? 'logsPulse 650ms ease-in-out' : 'none',
                  }}
                />
              </Box>

              {!sseConnected && Boolean(currentJobId) && !isTerminal && (
                <Tooltip title={sseLastError ?? 'Disconnected'}>
                  <Chip
                    size="small"
                    icon={<LinkOffIcon fontSize="small" />}
                    color="warning"
                    variant="outlined"
                    label="stream"
                  />
                </Tooltip>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                Reconnects:
              </Typography>
              <Chip
                size="small"
                label={String(reconnectCount)}
                variant={reconnectCount > 0 ? 'filled' : 'outlined'}
                color={reconnectCount > 0 ? 'warning' : 'default'}
                sx={{ fontWeight: 'bold' }}
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Title:
              </Typography>

              <Tooltip
                arrow
                placement="bottom-start"
                title={
                  jobCommandText ? (
                    <Box sx={{ maxWidth: 720 }}>
                      <Box
                        component="pre"
                        sx={{
                          m: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'monospace',
                          fontSize: 12,
                        }}
                      >
                        {jobCommandText}
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.75 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ContentCopyIcon fontSize="small" />}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void copyText(jobCommandText);
                          }}
                        >
                          Copy
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    'Command unavailable'
                  )
                }
              >
                <Chip
                  size="small"
                  variant="outlined"
                  label={jobTitleText}
                  sx={{
                    maxWidth: 520,
                    cursor: jobCommandText ? 'help' : 'default',
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                  }}
                />
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Job id:
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={currentJobId ?? '—'}
                sx={{ fontFamily: 'monospace', maxWidth: 420 }}
              />
              <Tooltip title={currentJobId ? 'Copy job id' : 'No job id'}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => currentJobId && void copyText(currentJobId)}
                    disabled={!currentJobId}
                  >
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>

          <ExecutionTiming
            pageJob={pageJob}
            runtimeNowMs={runtimeNowMs}
            eventLogs={eventLogs}
            isRunning={isRunning}
          />
        </Box>
      </CardContent>
    </Card>
  );
}

function ExecutionTiming({
  pageJob,
  runtimeNowMs,
  eventLogs,
  isRunning,
}: {
  pageJob: JobStatus | null;
  runtimeNowMs: number;
  eventLogs: string[];
  isRunning: boolean;
}) {
  const pageRuntimeText = (() => {
    const startedAt = pageJob?.startedAt ?? pageJob?.createdAt;
    if (!startedAt) return '—';
    const startedAtMs = new Date(startedAt).getTime();
    if (Number.isNaN(startedAtMs)) return '—';
    const endMs = pageJob?.finishedAt ? new Date(pageJob.finishedAt).getTime() : runtimeNowMs;
    const ms = Math.max(0, endMs - startedAtMs);
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  })();

  const pageLastLine =
    pageJob?.lastLine ?? (eventLogs.length > 0 ? eventLogs[eventLogs.length - 1] : undefined);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 260, flex: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          Runtime:
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          icon={<AccessTimeIcon fontSize="small" />}
          label={
            pageJob?.finishedAt ? pageRuntimeText : isRunning ? `running… ${pageRuntimeText}` : '—'
          }
        />

        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          Exit code:
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={typeof pageJob?.exitCode === 'number' ? String(pageJob.exitCode) : '—'}
          color={
            pageJob?.status === 'SUCCEEDED'
              ? 'success'
              : pageJob?.status === 'FAILED'
                ? 'error'
                : 'default'
          }
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">
          Started:
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={formatTimestampHuman(pageJob?.startedAt ?? pageJob?.createdAt)}
        />

        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          Finished:
        </Typography>
        <Chip size="small" variant="outlined" label={formatTimestampHuman(pageJob?.finishedAt)} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        <Typography variant="caption" color="text.secondary">
          Last output line:
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            borderRadius: 1,
            bgcolor: 'rgba(0,0,0,0.15)',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 96,
            overflow: 'auto',
          }}
        >
          {pageLastLine ?? '—'}
        </Box>
      </Box>
    </Box>
  );
}
