'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  Stack,
  Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';
import TerminalIcon from '@mui/icons-material/Terminal';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/Pending';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BoltIcon from '@mui/icons-material/Bolt';
import ListAltIcon from '@mui/icons-material/ListAlt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useJobRunner } from '@/app/hooks/useJobRunner';
import { useScripts } from '@/app/hooks/useScripts';
import type { Script } from '@/app/hooks/useScripts';
import { ScriptSection } from './scripts/ScriptSection';
import { createClientLogger } from '@/lib/clientLogger';

interface JobStatus {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastLine?: string;
  title?: string;
}

function formatDurationHuman(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestampHuman(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // To the second, local time.
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

export default function ScriptRunner() {
  const { scripts, loading, error, refresh } = useScripts();
  const {
    executing,
    eventLogs,
    clearEventLogs,
    runCommand,
    currentJobId,
    lastJobStatus,
    reconnectCount,
    lastCommand,
    lastLabel,
    sseConnected,
    sseLastError,
    maxExecutionLogLines,
  } = useJobRunner();

  const logger = createClientLogger('ScriptRunner');

  const [executingName, setExecutingName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [outputDialog, setOutputDialog] = useState<{
    open: boolean;
    title: string;
    jobDetails?: JobStatus | null;
  }>({
    open: false,
    title: '',
  });
  const [freeTextCommand, setFreeTextCommand] = useState('');
  const [showFreeTextInput, setShowFreeTextInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showEventLogs, setShowEventLogs] = useState(false);
  const executionLogRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevStatusRef = useRef<string | null>(null);
  const [statusPulseOn, setStatusPulseOn] = useState(false);
  const nowMsRef = useRef<number>(0);
  const [nowMs, setNowMs] = useState<number>(0);
  const [showStreamIssueChip, setShowStreamIssueChip] = useState(false);

  const isRunning = lastJobStatus?.status === 'RUNNING' || lastJobStatus?.status === 'QUEUED';
  const isTerminal = lastJobStatus?.status === 'SUCCEEDED' || lastJobStatus?.status === 'FAILED' || lastJobStatus?.status === 'CANCELED';
  const executeBlocked = Boolean(currentJobId) && isRunning;
  const executeBlockedReason = executeBlocked ? 'Another job is still running. Wait for it to finish before starting a new one.' : '';

  const copyToClipboard = async (text: string, scriptName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(scriptName);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      logger.error('Failed to copy to clipboard', err);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess('job');
      setTimeout(() => setCopySuccess(null), 1200);
    } catch (err) {
      logger.error('Failed to copy to clipboard', err);
    }
  };

  const handleRefresh = async () => {
    setMessage(null);
    await refresh();
    if (error) {
      setMessage({ type: 'error', text: error });
    }
  };

  const executeScript = async (scriptName: string, command: string) => {
    if (executeBlocked) {
      setMessage({ type: 'error', text: executeBlockedReason });
      return;
    }

    setExecutingName(scriptName);
    setMessage(null);
    setShowEventLogs(true);

    // Let the hook clear the previous run logs and stream the new run.
    const result = await runCommand(command, scriptName);

    if (result.ok) {
      // The message lifecycle is handled by the status-driven effect; keep a short startup text only.
      setMessage({ type: 'success', text: `Started "${scriptName}".` });
    } else {
      setMessage({ type: 'error', text: `Failed to start "${scriptName}"` });
      // Keep a small dialog with the error output.
      setOutputDialog({
        open: true,
        title: scriptName,
        jobDetails: result.job,
      });
    }

    setExecutingName(null);
  };

  const executeFreeText = async () => {
    if (!freeTextCommand.trim()) {
      setMessage({ type: 'error', text: 'Please enter a command' });
      return;
    }

    await executeScript('Free Text Command', freeTextCommand);
    setFreeTextCommand('');
    setShowFreeTextInput(false);
  };

  const handleCloseDialog = () => {
    setOutputDialog({ open: false, title: '' });
  };

  const jobStatusUi = (() => {
    const st = lastJobStatus?.status;
    if (!st) return { label: '—', color: 'default' as const, icon: null };
    if (st === 'SUCCEEDED') return { label: 'SUCCEEDED', color: 'success' as const, icon: <CheckCircleIcon fontSize="small" color="success" /> };
    if (st === 'FAILED' || st === 'CANCELED') return { label: st, color: 'error' as const, icon: <CancelIcon fontSize="small" color="error" /> };
    if (st === 'RUNNING') return { label: 'RUNNING', color: 'warning' as const, icon: <CircularProgress size={16} /> };
    return { label: st, color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
  })();

  const statusPulseGlow = useMemo(() => {
    const st = lastJobStatus?.status;
    if (!st) return 'rgba(255,255,255,0.06)';
    if (st === 'SUCCEEDED') return 'rgba(76, 175, 80, 0.18)'; // success green
    if (st === 'FAILED' || st === 'CANCELED') return 'rgba(244, 67, 54, 0.18)'; // error red
    if (st === 'RUNNING' || st === 'QUEUED') return 'rgba(255, 193, 7, 0.18)'; // warning amber
    return 'rgba(255,255,255,0.06)';
  }, [lastJobStatus?.status]);

  useEffect(() => {
    // Avoid a distracting flash: only show the stream-issue chip if the error persists briefly.
    const t = window.setTimeout(() => {
      setShowStreamIssueChip(Boolean(sseLastError) && !isTerminal && Boolean(currentJobId));
    }, 500);

    return () => {
      window.clearTimeout(t);
      window.setTimeout(() => setShowStreamIssueChip(false), 0);
    };
  }, [sseLastError, isTerminal, currentJobId]);

  useEffect(() => {
    const el = executionLogRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 40;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = executionLogRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [eventLogs.length]);

  useEffect(() => {
    if (!isRunning) return;
    const syncNow = () => {
      const t = Date.now();
      nowMsRef.current = t;
      setNowMs(t);
    };
    syncNow();
    const id = window.setInterval(syncNow, 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const canCopyCmd = Boolean(lastCommand && lastCommand.trim().length > 0);

  useEffect(() => {
    const next = lastJobStatus?.status ?? null;
    const prev = prevStatusRef.current;

    if (next && next !== prev) {
      if (next === 'QUEUED' || next === 'RUNNING' || next === 'SUCCEEDED' || next === 'FAILED' || next === 'CANCELED') {
        const frame = window.setTimeout(() => setStatusPulseOn(true), 0);
        const t = window.setTimeout(() => setStatusPulseOn(false), 650);
        prevStatusRef.current = next;
        return () => {
          window.clearTimeout(frame);
          window.clearTimeout(t);
        };
      }
    }

    prevStatusRef.current = next;
  }, [lastJobStatus?.status]);

  const runtimeText = (() => {
    const startedAtMs = lastJobStatus?.startedAt ? new Date(lastJobStatus.startedAt).getTime() : null;
    if (!startedAtMs || Number.isNaN(startedAtMs)) return '—';

    const endMs = lastJobStatus?.finishedAt ? new Date(lastJobStatus.finishedAt).getTime() : nowMs;
    const ms = Math.max(0, endMs - startedAtMs);
    return formatDurationHuman(ms);
  })();

  const runtimeChipUi = (() => {
    const st = lastJobStatus?.status;
    if (!st) {
      return {
        color: 'default' as const,
        variant: 'outlined' as const,
        icon: <AccessTimeIcon fontSize="small" />,
      };
    }

    if (st === 'SUCCEEDED') {
      return { color: 'success' as const, variant: 'outlined' as const, icon: <AccessTimeIcon fontSize="small" /> };
    }
    if (st === 'FAILED' || st === 'CANCELED') {
      return { color: 'error' as const, variant: 'outlined' as const, icon: <AccessTimeIcon fontSize="small" /> };
    }
    if (st === 'RUNNING') {
      return { color: 'warning' as const, variant: 'filled' as const, icon: <BoltIcon fontSize="small" /> };
    }
    return { color: 'warning' as const, variant: 'outlined' as const, icon: <AccessTimeIcon fontSize="small" /> };
  })();

  // Open/finalize the output dialog ONLY when we see the terminal SSE summary.
  useEffect(() => {
    if (!lastJobStatus || !isTerminal) return;

    const title = lastJobStatus.title ?? lastLabel ?? 'Free Text Command';

    const t = window.setTimeout(() => {
      setOutputDialog({
        open: true,
        title,
        jobDetails: lastJobStatus,
      });
    }, 0);

    return () => window.clearTimeout(t);
  }, [isTerminal, lastJobStatus, lastLabel]);

    // Derive the banner message from current job status. Keep it simple (no useMemo) to satisfy React Compiler linting.
    const derivedMessage = (() => {
      const st = lastJobStatus?.status;
      if (!st) return null;

      if (st === 'QUEUED' || st === 'RUNNING') {
        return { type: 'success' as const, text: `Running "${lastLabel ?? 'Free Text Command'}"…` };
      }

      if (st === 'SUCCEEDED') {
        return { type: 'success' as const, text: `"${lastLabel ?? 'Free Text Command'}" completed successfully.` };
      }

      if (st === 'FAILED') {
        return {
          type: 'error' as const,
          text: `"${lastLabel ?? 'Free Text Command'}" failed.${typeof lastJobStatus?.exitCode === 'number' ? ` (exitCode=${lastJobStatus.exitCode})` : ''}`,
        };
      }

      if (st === 'CANCELED') {
        return { type: 'error' as const, text: `"${lastLabel ?? 'Free Text Command'}" was canceled.` };
      }

      return null;
    })();
    // Remove the setMessage() effect driven from status.

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  const byCategory = (cat: Script['category']) => scripts.filter((s) => s.category === cat);

  const dialogJob = outputDialog.jobDetails ?? lastJobStatus ?? null;

  const dialogStatusUi = (() => {
    const st = dialogJob?.status;
    if (!st) return { label: '—', color: 'default' as const, icon: <PendingIcon fontSize="small" /> };
    if (st === 'SUCCEEDED') return { label: 'SUCCEEDED', color: 'success' as const, icon: <CheckCircleIcon fontSize="small" /> };
    if (st === 'FAILED') return { label: 'FAILED', color: 'error' as const, icon: <ErrorOutlineIcon fontSize="small" /> };
    if (st === 'CANCELED') return { label: 'CANCELED', color: 'error' as const, icon: <CancelIcon fontSize="small" /> };
    if (st === 'RUNNING') return { label: 'RUNNING', color: 'warning' as const, icon: <CircularProgress size={14} /> };
    return { label: st, color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
  })();

  const lastOutputLine = dialogJob?.lastLine ?? (eventLogs.length > 0 ? eventLogs[eventLogs.length - 1] : undefined);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TerminalIcon /> Script Runner
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Execute scripts from the .run directory with environment parameters
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<CodeIcon />} onClick={() => setShowFreeTextInput(!showFreeTextInput)} color="secondary">
            {showFreeTextInput ? 'Hide' : 'Custom Command'}
          </Button>
        </Box>
      </Box>

      {error && !message && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {error}
        </Alert>
      )}

      {showFreeTextInput && (
        <Card sx={{ mb: 3, bgcolor: 'background.paper', border: '2px solid', borderColor: 'secondary.main' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Execute Custom Command
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter any docker compose command to execute through the orchestrator
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={freeTextCommand}
              onChange={(e) => setFreeTextCommand(e.target.value)}
              placeholder="e.g., docker compose --project-directory compose ps"
              disabled={executing || executeBlocked}
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <Box display="flex" gap={2}>
              <Tooltip title={executeBlockedReason} arrow disableHoverListener={!executeBlocked}>
                <span>
                  <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={executeFreeText} disabled={executing || executeBlocked || !freeTextCommand.trim()}>
                    Execute
                  </Button>
                </span>
              </Tooltip>
              <Button
                variant="outlined"
                onClick={() => {
                  setFreeTextCommand('');
                  setShowFreeTextInput(false);
                }}
              >
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {(message || derivedMessage) && (
        <Alert
          severity={(message ?? derivedMessage)!.type}
          sx={{ mb: 2 }}
          onClose={() => setMessage(null)}
        >
          {(message ?? derivedMessage)!.text}
        </Alert>
      )}

      {(showEventLogs || Boolean(currentJobId)) && (eventLogs.length > 0 || Boolean(currentJobId)) && (
        <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={2}>
              <Box>
                <Typography variant="h6">Execution Logs (Real-time)</Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Job:
                  </Typography>

                  <Tooltip
                    placement="bottom-start"
                    title={
                      <Box sx={{ maxWidth: 640 }}>
                        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, opacity: 0.8 }}>
                          Executed command
                        </Typography>
                        <Box
                          component="pre"
                          sx={{
                            m: 0,
                            p: 1,
                            borderRadius: 1,
                            bgcolor: 'rgba(0,0,0,0.35)',
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {lastCommand ?? '—'}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5, gap: 0.5 }}>
                          <Tooltip title={canCopyCmd ? 'Copy command' : 'No command available'}>
                            <span>
                              <IconButton size="small" onClick={() => canCopyCmd && void copyText(lastCommand!)} disabled={!canCopyCmd}>
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    }
                  >
                    <Chip size="small" variant="outlined" label={currentJobId ?? '—'} sx={{ fontFamily: 'monospace', maxWidth: 320, cursor: lastCommand ? 'help' : 'default' }} />
                  </Tooltip>

                  <Tooltip title={currentJobId ? 'Copy job id' : 'No job id'}>
                    <span>
                      <IconButton size="small" onClick={() => currentJobId && void copyText(currentJobId)} disabled={!currentJobId}>
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Typography variant="caption" color="text.secondary">
                    Status:
                  </Typography>
                  <Chip
                    size="small"
                    color={jobStatusUi.color}
                    label={jobStatusUi.label}
                    icon={jobStatusUi.icon ?? undefined}
                    sx={{
                      fontWeight: 'bold',
                      transition: 'transform 180ms ease, box-shadow 220ms ease, filter 300ms ease',
                      transform: statusPulseOn ? 'scale(1.04)' : 'none',
                      boxShadow: statusPulseOn ? `0 0 0 4px ${statusPulseGlow}, 0 0 14px 2px ${statusPulseGlow}` : 'none',
                      filter: statusPulseOn ? 'saturate(1.15)' : 'none',
                    }}
                  />

                  <Typography variant="caption" color="text.secondary">
                    Reconnects:
                  </Typography>
                  <Chip size="small" variant={reconnectCount > 0 ? 'filled' : 'outlined'} color={reconnectCount > 0 ? 'warning' : 'default'} label={String(reconnectCount)} sx={{ fontWeight: 'bold' }} />

                  <Typography variant="caption" color="text.secondary">
                    Runtime:
                  </Typography>
                  <Chip
                    size="small"
                    variant={runtimeChipUi.variant}
                    color={runtimeChipUi.color}
                    icon={runtimeChipUi.icon}
                    label={runtimeText}
                    sx={{
                      fontWeight: 'bold',
                      transition: 'transform 150ms ease, filter 300ms ease',
                      transform: isRunning ? 'translateY(-0.5px)' : 'none',
                      filter: isRunning ? 'saturate(1.1)' : 'none',
                    }}
                  />

                  {currentJobId && (
                    <>
                      <Typography variant="caption" color="text.secondary">
                        Events:
                      </Typography>
                      <Chip size="small" variant={sseConnected ? 'outlined' : 'filled'} color={sseConnected ? 'success' : 'warning'} label={sseConnected ? 'connected' : 'disconnected'} sx={{ fontWeight: 'bold' }} />
                      {showStreamIssueChip && (
                        <Tooltip title={sseLastError}>
                          <Chip size="small" color="warning" variant="outlined" label="stream issue" />
                        </Tooltip>
                      )}
                    </>
                  )}
                </Stack>
              </Box>

              <Box>
                <Button size="small" variant="outlined" onClick={clearEventLogs} sx={{ mr: 1 }}>
                  Clear
                </Button>
                <Button size="small" variant="outlined" onClick={() => setShowEventLogs(false)}>
                  Hide
                </Button>
              </Box>
            </Box>

            <Box
              ref={executionLogRef}
              sx={{
                bgcolor: 'grey.900',
                color: 'grey.100',
                p: 2,
                borderRadius: 1,
                maxHeight: '400px',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {eventLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </Box>
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Lines:
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={eventLogs.length >= maxExecutionLogLines ? 'warning' : 'default'}
                icon={<ListAltIcon fontSize="small" />}
                label={`${eventLogs.length}/${maxExecutionLogLines}`}
                sx={{
                  fontWeight: 'bold',
                  transition: 'transform 150ms ease, filter 300ms ease, box-shadow 220ms ease',
                  transform: isRunning ? 'translateY(-0.5px)' : 'none',
                  filter: isRunning ? 'saturate(1.1)' : 'none',
                  boxShadow: isRunning ? '0 0 0 4px rgba(255,255,255,0.06), 0 0 10px 2px rgba(255,255,255,0.06)' : 'none',
                }}
              />
              <Typography variant="caption" color="text.secondary">
                (keeps last/max)
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      <ScriptSection
        title="Build Images"
        scripts={byCategory('build-img')}
        executingName={executingName}
        copySuccessFor={copySuccess}
        executeDisabled={executeBlocked}
        executeDisabledReason={executeBlockedReason}
        accentColor="primary.main"
        chipColor="primary"
        onCopyAction={(s) => void copyToClipboard(s.command, s.name)}
        onExecuteAction={(s) => void executeScript(s.name, s.command)}
      />

      <ScriptSection
        title="Multi-Container Orchestration"
        scripts={byCategory('multi-cont')}
        executingName={executingName}
        copySuccessFor={copySuccess}
        executeDisabled={executeBlocked}
        executeDisabledReason={executeBlockedReason}
        accentColor="secondary.main"
        chipColor="secondary"
        onCopyAction={(s) => void copyToClipboard(s.command, s.name)}
        onExecuteAction={(s) => void executeScript(s.name, s.command)}
      />

      <ScriptSection
        title="Single Container"
        scripts={byCategory('single-cont')}
        executingName={executingName}
        copySuccessFor={copySuccess}
        executeDisabled={executeBlocked}
        executeDisabledReason={executeBlockedReason}
        accentColor="info.main"
        chipColor="info"
        onCopyAction={(s) => void copyToClipboard(s.command, s.name)}
        onExecuteAction={(s) => void executeScript(s.name, s.command)}
      />

      <ScriptSection
        title="Tests"
        scripts={byCategory('test')}
        executingName={executingName}
        copySuccessFor={copySuccess}
        executeDisabled={executeBlocked}
        executeDisabledReason={executeBlockedReason}
        accentColor="success.main"
        chipColor="success"
        onCopyAction={(s) => void copyToClipboard(s.command, s.name)}
        onExecuteAction={(s) => void executeScript(s.name, s.command)}
      />

      {scripts.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="body1" color="text.secondary">
            No scripts found with required prefixes ([build-img], [multi-cont], [single-cont], [test])
          </Typography>
        </Box>
      )}

      <Dialog open={outputDialog.open} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <TerminalIcon fontSize="small" />
            <Typography variant="h6" component="div" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {outputDialog.title || 'Job Result'}
            </Typography>
            <Chip size="small" color={dialogStatusUi.color} icon={dialogStatusUi.icon} label={dialogStatusUi.label} sx={{ fontWeight: 'bold' }} />
          </Box>
        </DialogTitle>

        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                Job id:
              </Typography>
              <Chip size="small" variant="outlined" label={dialogJob?.jobId ?? '—'} sx={{ fontFamily: 'monospace', maxWidth: 420 }} />
              <Tooltip title={dialogJob?.jobId ? 'Copy job id' : 'No job id'}>
                <span>
                  <IconButton size="small" onClick={() => dialogJob?.jobId && void copyText(dialogJob.jobId)} disabled={!dialogJob?.jobId}>
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

              <Typography variant="caption" color="text.secondary">
                Reconnects:
              </Typography>
              <Chip size="small" label={String(reconnectCount)} variant={reconnectCount > 0 ? 'filled' : 'outlined'} color={reconnectCount > 0 ? 'warning' : 'default'} sx={{ fontWeight: 'bold' }} />

              {!sseConnected && (
                <Tooltip title={sseLastError ?? 'Disconnected'}>
                  <Chip size="small" icon={<LinkOffIcon fontSize="small" />} color="warning" variant="outlined" label="stream" />
                </Tooltip>
              )}
            </Box>

            <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
              <CardContent sx={{ py: 1.5 }}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Title:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {dialogJob?.title ?? outputDialog.title ?? 'Free Text Command'}
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Exit code:
                    </Typography>
                    <Chip size="small" variant="outlined" label={typeof dialogJob?.exitCode === 'number' ? String(dialogJob.exitCode) : '—'} color={dialogJob?.status === 'SUCCEEDED' ? 'success' : dialogJob?.status === 'FAILED' ? 'error' : 'default'} />

                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      Runtime:
                    </Typography>
                    <Chip size="small" variant="outlined" icon={<AccessTimeIcon fontSize="small" />} label={runtimeText} />
                  </Box>

                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Started:
                    </Typography>
                    <Chip size="small" variant="outlined" label={formatTimestampHuman(dialogJob?.startedAt ?? dialogJob?.createdAt)} />

                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      Finished:
                    </Typography>
                    <Chip size="small" variant="outlined" label={formatTimestampHuman(dialogJob?.finishedAt)} />
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Last output line:
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.25,
                        borderRadius: 1,
                        bgcolor: 'rgba(0,0,0,0.35)',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 180,
                        overflow: 'auto',
                      }}
                    >
                      {lastOutputLine ?? '—'}
                    </Box>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="outlined" onClick={handleCloseDialog}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
