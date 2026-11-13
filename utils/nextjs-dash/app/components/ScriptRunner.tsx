'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useJobRunner } from '@/app/hooks/useJobRunner';
import { useScripts } from '@/app/hooks/useScripts';
import type { Script } from '@/app/hooks/useScripts';
import { createClientLogger } from '@/lib/clientLogger';
import { ScriptSection } from './scripts/ScriptSection';
import { useTimedPulse } from '@/app/hooks/useTimedPulse';
import { CurrentExecution } from './scripts/CurrentExecution';
import { ExecutionLogs } from './scripts/ExecutionLogs';

const clientLogger = createClientLogger('ScriptRunner');

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

  const [executingName, setExecutingName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dismissedBannerKey, setDismissedBannerKey] = useState<string | null>(null);
  const [freeTextCommand, setFreeTextCommand] = useState('');
  const [showFreeTextInput, setShowFreeTextInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showEventLogs, setShowEventLogs] = useState(false);
  const [showStreamIssueChip, setShowStreamIssueChip] = useState(false);
  const [runtimeNowMs, setRuntimeNowMs] = useState<number>(() => Date.now());

  const executionLogRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const copyFeedbackTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const { on: statusPulseOn } = useTimedPulse({
    durationMs: 650,
    trigger: lastJobStatus?.status,
    allowFalsy: false,
  });

  const isRunning = lastJobStatus?.status === 'RUNNING' || lastJobStatus?.status === 'QUEUED';
  const isTerminal =
    lastJobStatus?.status === 'SUCCEEDED' ||
    lastJobStatus?.status === 'FAILED' ||
    lastJobStatus?.status === 'CANCELED';

  const { on: terminalPulseOn } = useTimedPulse({
    durationMs: 1600,
    trigger: isTerminal ? 'TERMINAL' : 'NOT_TERMINAL',
    allowFalsy: true,
  });

  const executeBlocked = Boolean(currentJobId) && isRunning;
  const executeBlockedReason = executeBlocked
    ? 'Another job is still running. Wait for it to finish before starting a new one.'
    : '';

  const [envValidation, setEnvValidation] = useState<{
    loaded: boolean;
    hostRepoSet: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/env', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setEnvValidation({ loaded: false, hostRepoSet: false });
          return;
        }
        const body = (await res.json()) as {
          validation?: { loaded?: unknown; hostRepoSet?: unknown };
        };
        const loaded = Boolean(body.validation?.loaded);
        const hostRepoSet = Boolean(body.validation?.hostRepoSet);
        if (!cancelled) setEnvValidation({ loaded, hostRepoSet });
      } catch {
        if (!cancelled) setEnvValidation({ loaded: false, hostRepoSet: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const envBlocked =
    envValidation !== null && (!envValidation.loaded || !envValidation.hostRepoSet);
  const envBlockedReason = 'HOST_REPO not set in .env';
  const executeDisabled = executeBlocked || envBlocked;
  const executeDisabledReason = envBlocked ? envBlockedReason : executeBlockedReason;

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setRuntimeNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const copyToClipboard = useCallback(
    async (text: string, scriptName: string, durationMs = 2000) => {
      try {
        await navigator.clipboard.writeText(text);
        if (!mountedRef.current) return;
        if (copyFeedbackTimeoutRef.current !== null) {
          window.clearTimeout(copyFeedbackTimeoutRef.current);
        }
        setCopySuccess(scriptName);
        copyFeedbackTimeoutRef.current = window.setTimeout(() => {
          copyFeedbackTimeoutRef.current = null;
          setCopySuccess(null);
        }, durationMs);
      } catch (err) {
        clientLogger.error('Failed to copy to clipboard', err);
      }
    },
    [],
  );

  const copyText = useCallback(
    (text: string) => copyToClipboard(text, 'job', 1000),
    [copyToClipboard],
  );

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
        text: maybeBusy
          ? `Orchestrator is busy. Try again shortly.`
          : `Failed to start "${scriptName}"`,
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
    const resetTimeout = window.setTimeout(() => setShowStreamIssueChip(false), 0);
    const t = window.setTimeout(() => {
      setShowStreamIssueChip(Boolean(sseLastError) && !isTerminal && Boolean(currentJobId));
    }, 500);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(resetTimeout);
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

  // Derive the banner message from current job status.
  const derivedMessage = (() => {
    const st = lastJobStatus?.status;
    if (!st) return null;

    if (st === 'QUEUED' || st === 'RUNNING') {
      return { type: 'success' as const, text: `Running "${lastLabel ?? 'Free Text Command'}"…` };
    }

    if (st === 'SUCCEEDED') {
      return {
        type: 'success' as const,
        text: `"${lastLabel ?? 'Free Text Command'}" completed successfully.`,
      };
    }

    if (st === 'FAILED') {
      return {
        type: 'error' as const,
        text: `"${lastLabel ?? 'Free Text Command'}" failed.${typeof lastJobStatus?.exitCode === 'number' ? ` (exitCode=${lastJobStatus.exitCode})` : ''}`,
      };
    }

    if (st === 'CANCELED') {
      return {
        type: 'error' as const,
        text: `"${lastLabel ?? 'Free Text Command'}" was canceled.`,
      };
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

  const hasAnyExecutionState =
    Boolean(currentJobId) || eventLogs.length > 0 || Boolean(lastJobStatus);

  if (loading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const byCategory = (cat: Script['category']) => scripts.filter((s) => s.category === cat);

  // Use the job runner's canonical title/label (matches banner). Avoid falling back to submittedRun here,
  // because it can be stale relative to restored job state.
  const jobTitleText = submittedRun?.label ?? lastLabel ?? '—';

  const jobCommandText = (() => {
    // Prefer the persisted runner command; only use the local submitted value before the runner is populated.
    if (lastCommand) return lastCommand;
    if (submittedRun?.command && isRunning) return submittedRun.command;
    return '';
  })();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography
            variant="h5"
            gutterBottom
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <TerminalIcon /> Script Runner
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Execute scripts from the .run directory with environment parameters
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          <Tooltip
            title={envBlocked ? envBlockedReason : ''}
            arrow
            disableHoverListener={!envBlocked}
          >
            <span>
              <Button
                variant="contained"
                startIcon={<CodeIcon />}
                onClick={() => setShowFreeTextInput(!showFreeTextInput)}
                color="secondary"
                disabled={envBlocked}
              >
                {showFreeTextInput ? 'Hide' : 'Custom Command'}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {error && !message && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => {
            setMessage(null);
            setDismissedBannerKey(bannerKey);
          }}
        >
          {error}
        </Alert>
      )}

      {showFreeTextInput && (
        <Card
          sx={{
            mb: 3,
            bgcolor: 'background.paper',
            border: '2px solid',
            borderColor: 'secondary.main',
          }}
        >
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
              disabled={executing || executeDisabled}
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Tooltip title={executeDisabledReason} arrow disableHoverListener={!executeDisabled}>
                <span>
                  <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={executeFreeText}
                    disabled={executing || executeDisabled || !freeTextCommand.trim()}
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

      <CurrentExecution
        lastJobStatus={lastJobStatus}
        runtimeNowMs={runtimeNowMs}
        eventLogs={eventLogs}
        terminalPulseOn={terminalPulseOn}
        statusPulseOn={statusPulseOn}
        sseConnected={sseConnected}
        currentJobId={currentJobId}
        isTerminal={isTerminal}
        sseLastError={sseLastError}
        reconnectCount={reconnectCount}
        jobCommandText={jobCommandText}
        jobTitleText={jobTitleText}
        copyText={copyText}
        isRunning={isRunning}
      />

      {hasAnyExecutionState && (
        <ExecutionLogs
          sseConnected={sseConnected}
          showStreamIssueChip={showStreamIssueChip}
          reconnectCount={reconnectCount}
          showEventLogs={showEventLogs}
          statusPulseOn={statusPulseOn}
          maxExecutionLogLines={maxExecutionLogLines}
          eventLogs={eventLogs}
          executionLogRef={executionLogRef}
          clearEventLogs={clearEventLogs}
          onReset={() => {
            setMessage(null);
            setDismissedBannerKey(null);
            setSubmittedRun(null);
            reset();
            setShowEventLogs(false);
          }}
          onToggle={() => setShowEventLogs((v) => !v)}
        />
      )}

      <ScriptSection
        title="Build Images"
        scripts={byCategory('build-img')}
        executingName={executingName}
        copySuccessFor={copySuccess}
        executeDisabled={executeDisabled}
        executeDisabledReason={executeDisabledReason}
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
        executeDisabled={executeDisabled}
        executeDisabledReason={executeDisabledReason}
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
        executeDisabled={executeDisabled}
        executeDisabledReason={executeDisabledReason}
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
        executeDisabled={executeDisabled}
        executeDisabledReason={executeDisabledReason}
        accentColor="success.main"
        chipColor="success"
        onCopyAction={(s) => void copyToClipboard(s.command, s.name)}
        onExecuteAction={(s) => void executeScript(s.name, s.command)}
      />

      {scripts.length === 0 && !loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No scripts found with required prefixes ([build-img], [multi-cont], [single-cont],
            [test])
          </Typography>
        </Box>
      )}
    </Box>
  );
}
