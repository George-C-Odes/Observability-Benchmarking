'use client';

import { useState, useRef, useEffect } from 'react';
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
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CodeIcon from '@mui/icons-material/Code';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useJobRunner } from '@/app/hooks/useJobRunner';
import { useScripts } from '@/app/hooks/useScripts';
import type { Script } from '@/app/hooks/useScripts';
import { ScriptSection } from './scripts/ScriptSection';

interface JobStatus {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastLine?: string;
}

export default function ScriptRunner() {
  const { scripts, loading, error, refresh } = useScripts();
  const { executing, eventLogs, clearEventLogs, runCommand } = useJobRunner();

  const [executingName, setExecutingName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [outputDialog, setOutputDialog] = useState<{ open: boolean; title: string; output: string; jobDetails?: JobStatus | null }>({
    open: false,
    title: '',
    output: '',
  });
  const [freeTextCommand, setFreeTextCommand] = useState('');
  const [showFreeTextInput, setShowFreeTextInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showEventLogs, setShowEventLogs] = useState(false);
  const executionLogRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const copyToClipboard = async (text: string, scriptName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(scriptName);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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
    setExecutingName(scriptName);
    setMessage(null);
    setShowEventLogs(true);

    const result = await runCommand(command, scriptName);

    setOutputDialog({
      open: true,
      title: scriptName,
      output: result.output,
      jobDetails: result.job,
    });

    if (result.ok) {
      setMessage({ type: 'success', text: `Command "${scriptName}" executed successfully!` });
    } else {
      setMessage({ type: 'error', text: `Command "${scriptName}" failed` });
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
    setOutputDialog({ open: false, title: '', output: '' });
  };

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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  const byCategory = (cat: Script['category']) => scripts.filter((s) => s.category === cat);

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
          <Button
            variant="contained"
            startIcon={<CodeIcon />}
            onClick={() => setShowFreeTextInput(!showFreeTextInput)}
            color="secondary"
          >
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
              disabled={executing}
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={executeFreeText}
                disabled={executing || !freeTextCommand.trim()}
              >
                Execute
              </Button>
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

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {showEventLogs && eventLogs.length > 0 && (
        <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Execution Logs (Real-time)</Typography>
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
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing last {Math.min(eventLogs.length, 500)} lines (max 500)
            </Typography>
          </CardContent>
        </Card>
      )}

      <ScriptSection
        title="Build Images"
        scripts={byCategory('build-img')}
        executingName={executingName}
        copySuccessFor={copySuccess}
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
        <DialogTitle>
          {outputDialog.title} - Output
          {outputDialog.jobDetails && (
            <Chip
              label={outputDialog.jobDetails.status}
              size="small"
              sx={{
                ml: 2,
                bgcolor:
                  outputDialog.jobDetails.status === 'SUCCEEDED'
                    ? 'success.main'
                    : outputDialog.jobDetails.status === 'FAILED'
                      ? 'error.main'
                      : outputDialog.jobDetails.status === 'RUNNING'
                        ? 'warning.main'
                        : outputDialog.jobDetails.status === 'QUEUED'
                          ? 'warning.main'
                          : 'error.main',
                color: 'white',
                fontWeight: 'bold',
              }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              bgcolor: 'background.default',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
            }}
          >
            {outputDialog.output}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
