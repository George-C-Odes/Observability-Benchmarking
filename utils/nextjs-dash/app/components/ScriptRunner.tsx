'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PendingIcon from '@mui/icons-material/Pending';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useJobRunner } from '@/app/hooks/useJobRunner';
import { useScripts } from '@/app/hooks/useScripts';
import type { Script } from '@/app/hooks/useScripts';
import { createClientLogger } from '@/lib/clientLogger';
import { ScriptSection } from './scripts/ScriptSection';

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

export default function ScriptRunner() {
  const { scripts, loading, error, refresh } = useScripts();
  const {
    executing,
    eventLogs,
    clearEventLogs,
    reset,
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

  // Snapshot what the user *submitted* so the UI doesn't lag behind asynchronous SSE title updates.
  const [submittedRun, setSubmittedRun] = useState<{ label: string; command: string } | null>(null);

  const clientLogger = createClientLogger('ScriptRunner');

  const [executingName, setExecutingName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const [freeTextCommand, setFreeTextCommand] = useState('');
  const [showFreeTextInput, setShowFreeTextInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showEventLogs, setShowEventLogs] = useState(false);

  const executionLogRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const prevStatusRef = useRef<string | null>(null);
  const prevIsTerminalRef = useRef<boolean>(false);

  const [statusPulseOn, setStatusPulseOn] = useState(false);
  const [terminalPulseOn, setTerminalPulseOn] = useState(false);
  const [showStreamIssueChip, setShowStreamIssueChip] = useState(false);
  const [runtimeNowMs, setRuntimeNowMs] = useState<number>(() => Date.now());

  const isRunning = lastJobStatus?.status === 'RUNNING' || lastJobStatus?.status === 'QUEUED';
  const isTerminal = lastJobStatus?.status === 'SUCCEEDED' || lastJobStatus?.status === 'FAILED' || lastJobStatus?.status === 'CANCELED';
  const executeBlocked = Boolean(currentJobId) && isRunning;
  const executeBlockedReason = executeBlocked ? 'Another job is still running. Wait for it to finish before starting a new one.' : '';

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setRuntimeNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const copyToClipboard = async (text: string, scriptName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(scriptName);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      clientLogger.error('Failed to copy to clipboard', err);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess('job');
      setTimeout(() => setCopySuccess(null), 1000);
    } catch (err) {
      clientLogger.error('Failed to copy to clipboard', err);
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
    // Starting a new run should not show stale UI from the previous run.
    setMessage(null);
    setDismissedBannerKey(null);
    setShowEventLogs(true);

    // Reset the per-run snapshot so the UI doesn't keep showing the previous run if submit fails.
    setSubmittedRun({ label: scriptName, command });

    if (executeBlocked) {
      setMessage({ type: 'error', text: executeBlockedReason });
      return;
    }

    // Align with what the Clear button resets.
    // This clears currentJobId/lastJobStatus/lastCommand/lastLabel and disconnects SSE if any.
    reset();

    setExecutingName(scriptName);

    const result = await runCommand(command, scriptName);

    if (result.ok) {
      setMessage(null);
    } else {
      // If submit fails, make sure we don't keep a previous job id/title "stuck" on screen.
      // useJobRunner.runCommand sets lastJobStatus to FAILED with jobId 'N/A', and currentJobId remains null.
      // Keeping submittedRun is useful (it indicates what the user attempted to run), but we should ensure any
      // previous-job UI reporters don't linger.
      const details = result.output?.trim();
      const maybeBusy = details.includes('HTTP 503');
      setMessage({
        type: 'error',
        text: maybeBusy ? `Orchestrator is busy. Try again shortly.` : `Failed to start "${scriptName}"`,
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

  useEffect(() => {
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

  // Status pulse (any status change)
  useEffect(() => {
    const next = lastJobStatus?.status ?? null;
    const prev = prevStatusRef.current;

    if (next && next !== prev) {
      const frame = window.setTimeout(() => setStatusPulseOn(true), 0);
      const t = window.setTimeout(() => setStatusPulseOn(false), 650);
      prevStatusRef.current = next;
      return () => {
        window.clearTimeout(frame);
        window.clearTimeout(t);
      };
    }

    prevStatusRef.current = next;
  }, [lastJobStatus?.status]);

  // Terminal "inward closing" pulse (only when entering terminal)
  useEffect(() => {
    const prevTerminal = prevIsTerminalRef.current;
    if (isTerminal && !prevTerminal) {
      const frame = window.setTimeout(() => setTerminalPulseOn(true), 0);
      const t = window.setTimeout(() => setTerminalPulseOn(false), 1600);
      prevIsTerminalRef.current = true;
      return () => {
        window.clearTimeout(frame);
        window.clearTimeout(t);
      };
    }
    prevIsTerminalRef.current = isTerminal;
  }, [isTerminal]);

  // Derive the banner message from current job status.
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

  // If the user closes the banner, keep it dismissed until the status/message changes.
  // Model this as "dismissedBannerKey" instead of resetting state in an effect.
  const bannerMessage = message ?? derivedMessage;
  const bannerKey = bannerMessage
    ? `${lastJobStatus?.status ?? 'NONE'}|${bannerMessage.type}|${bannerMessage.text}`
    : null;
  const isBannerDismissed = Boolean(bannerKey) && dismissedBannerKey === bannerKey;
  const visibleBannerMessage = bannerMessage && !isBannerDismissed ? bannerMessage : null;

  const hasAnyExecutionState = Boolean(currentJobId) || eventLogs.length > 0 || Boolean(lastJobStatus);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  const byCategory = (cat: Script['category']) => scripts.filter((s) => s.category === cat);

  const pageJob = lastJobStatus;
  const pageStatusUi = (() => {
    const st = pageJob?.status;
    if (!st) return { label: '—', color: 'default' as const, icon: <PendingIcon fontSize="small" /> };
    if (st === 'SUCCEEDED') return { label: 'SUCCEEDED', color: 'success' as const, icon: <CheckCircleIcon fontSize="small" /> };
    if (st === 'FAILED') return { label: 'FAILED', color: 'error' as const, icon: <ErrorOutlineIcon fontSize="small" /> };
    if (st === 'CANCELED') return { label: 'CANCELED', color: 'error' as const, icon: <CancelIcon fontSize="small" /> };
    if (st === 'RUNNING') return { label: 'RUNNING', color: 'warning' as const, icon: <CircularProgress size={14} /> };
    if (st === 'QUEUED') return { label: 'QUEUED', color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
    return { label: st, color: 'warning' as const, icon: <PendingIcon fontSize="small" /> };
  })();

  const statusPulseColor = (() => {
    if (pageStatusUi.color === 'success') return '#2e7d32';
    if (pageStatusUi.color === 'error') return '#d32f2f';
    if (pageStatusUi.color === 'warning') return '#ed6c02';
    return '#90a4ae';
  })();

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

  const pageLastLine = pageJob?.lastLine ?? (eventLogs.length > 0 ? eventLogs[eventLogs.length - 1] : undefined);

  // Use the job runner's canonical title/label (matches banner). Avoid falling back to submittedRun here,
  // because it can be stale relative to restored job state.
  const jobTitleText = submittedRun?.label ?? pageJob?.title ?? lastLabel ?? '—';

  const jobCommandText = (() => {
    // Prefer the persisted runner command; only use the local submitted value before the runner is populated.
    if (lastCommand) return lastCommand;
    if (submittedRun?.command && isRunning) return submittedRun.command;
    return '';
  })();

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
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => { setMessage(null); setDismissedBannerKey(bannerKey); }}>
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
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={executeFreeText}
                    disabled={executing || executeBlocked || !freeTextCommand.trim()}
                  >
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

      {visibleBannerMessage && (
        <Alert
          severity={visibleBannerMessage.type}
          sx={{ mb: 2 }}
          onClose={() => {
            // If the banner is a derived status banner (no manual message), we need a dedicated dismiss flag.
            // If it's a manual message, clear it as well.
            if (bannerKey) setDismissedBannerKey(bannerKey);
            setMessage(null);
          }}
        >
          {visibleBannerMessage.text}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap">
            <Box display="flex" flexDirection="column" gap={1} minWidth={260}>
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
                    '@keyframes statusInwardPulse': {
                      '0%': { transform: 'scale(2.6)', opacity: 0.0 },
                      '18%': { transform: 'scale(2.25)', opacity: 0.38 },
                      '45%': { transform: 'scale(1.55)', opacity: 0.52 },
                      '75%': { transform: 'scale(1.12)', opacity: 0.32 },
                      '100%': { transform: 'scale(1.0)', opacity: 0.0 },
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: -12,
                      borderRadius: 22,
                      border: `2px solid ${statusPulseColor}`,
                      opacity: terminalPulseOn ? 1 : 0,
                      animation: terminalPulseOn ? 'statusInwardPulse 1000ms ease-in-out' : 'none',
                      pointerEvents: 'none',
                      filter: 'blur(0.2px)',
                    }}
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
                    <Chip size="small" icon={<LinkOffIcon fontSize="small" />} color="warning" variant="outlined" label="stream" />
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
                        <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12 }}>
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
                <Chip size="small" variant="outlined" label={currentJobId ?? '—'} sx={{ fontFamily: 'monospace', maxWidth: 420 }} />
                <Tooltip title={currentJobId ? 'Copy job id' : 'No job id'}>
                  <span>
                    <IconButton size="small" onClick={() => currentJobId && void copyText(currentJobId)} disabled={!currentJobId}>
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            <Box display="flex" flexDirection="column" gap={1} minWidth={260} flex={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  Runtime:
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  icon={<AccessTimeIcon fontSize="small" />}
                  label={pageJob?.finishedAt ? pageRuntimeText : (isRunning ? `running… ${pageRuntimeText}` : '—')}
                />

                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  Exit code:
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={typeof pageJob?.exitCode === 'number' ? String(pageJob.exitCode) : '—'}
                  color={pageJob?.status === 'SUCCEEDED' ? 'success' : pageJob?.status === 'FAILED' ? 'error' : 'default'}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  Started:
                </Typography>
                <Chip size="small" variant="outlined" label={formatTimestampHuman(pageJob?.startedAt ?? pageJob?.createdAt)} />

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
          </Box>
        </CardContent>
      </Card>

      {hasAnyExecutionState && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Box display="flex" alignItems="center" gap={1}>
                <ListAltIcon />
                <Typography variant="h6">Execution Logs</Typography>
                <Chip
                  size="small"
                  label={sseConnected ? 'SSE Connected' : 'SSE Disconnected'}
                  color={sseConnected ? 'success' : 'default'}
                  icon={sseConnected ? <CheckCircleIcon fontSize="small" /> : <LinkOffIcon fontSize="small" />}
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

              <Box display="flex" alignItems="center" gap={1}>
                <Tooltip title="Reset execution state (clears logs, status, and active job)">
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    startIcon={<ClearAllIcon />}
                    onClick={() => {
                      setMessage(null);
                      setDismissedBannerKey(null);
                      setSubmittedRun(null);
                      reset();
                      setShowEventLogs(false);
                    }}
                  >
                    Clear
                  </Button>
                </Tooltip>

                <Tooltip title={showEventLogs ? 'Hide execution logs' : 'Show execution logs'}>
                  <Button
                    size="small"
                    variant={showEventLogs ? 'contained' : 'outlined'}
                    startIcon={showEventLogs ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    onClick={() => setShowEventLogs((v) => !v)}
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

              <Box mt={1} display="flex" justifyContent="flex-end">
                <Button size="small" variant="outlined" onClick={clearEventLogs} sx={{ mr: 1 }}>
                  Clear Text
                </Button>
              </Box>
            </Collapse>
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
    </Box>
  );
}
