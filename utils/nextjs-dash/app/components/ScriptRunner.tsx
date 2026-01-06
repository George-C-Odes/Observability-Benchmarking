'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  IconButton,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface Script {
  name: string;
  description: string;
  command: string;
  category: 'build-img' | 'multi-cont' | 'single-cont' | 'test';
}

export default function ScriptRunner() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [outputDialog, setOutputDialog] = useState<{ open: boolean; title: string; output: string; jobDetails?: any }>({
    open: false,
    title: '',
    output: '',
  });
  const [freeTextCommand, setFreeTextCommand] = useState('');
  const [showFreeTextInput, setShowFreeTextInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [showEventLogs, setShowEventLogs] = useState(false);
  const MAX_EVENT_LOGS = 500;

  const copyToClipboard = async (text: string, scriptName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(scriptName);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const fetchScripts = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/scripts');
      if (!response.ok) throw new Error('Failed to fetch scripts');
      const data = await response.json();
      setScripts(data.scripts);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load scripts' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const executeScript = async (scriptName: string, command: string) => {
    setExecuting(scriptName);
    setMessage(null);
    setEventLogs([]); // Clear previous logs
    setShowEventLogs(true); // Show event logs panel
    
    try {
      // Step 1: Submit the job and get jobId immediately
      const submitResponse = await fetch('/api/orchestrator/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      const submitData = await submitResponse.json();

      if (!submitResponse.ok) {
        throw new Error(submitData.error || 'Failed to submit command');
      }

      const jobId = submitData.jobId;
      console.log(`Job submitted with ID: ${jobId}`);

      // Step 2: Start streaming events immediately
      streamJobEvents(jobId);

      // Step 3: Poll for job completion
      const finalStatus = await pollJobStatus(jobId);

      // Format output with job details
      let formattedOutput = '';
      if (finalStatus) {
        const startTime = new Date(finalStatus.startedAt);
        const endTime = new Date(finalStatus.finishedAt);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationSec = (durationMs / 1000).toFixed(2);
        
        formattedOutput = `Job ID: ${finalStatus.jobId}\n`;
        formattedOutput += `Status: ${finalStatus.status}\n`;
        formattedOutput += `Exit Code: ${finalStatus.exitCode}\n`;
        formattedOutput += `Duration: ${durationSec}s\n`;
        formattedOutput += `Started: ${startTime.toLocaleString()}\n`;
        formattedOutput += `Finished: ${endTime.toLocaleString()}\n\n`;
        
        if (finalStatus.lastLine) {
          formattedOutput += `Last Output Line:\n${finalStatus.lastLine}\n\n`;
        }
      }
      
      formattedOutput += 'Check the event logs below for full execution output';

      setOutputDialog({
        open: true,
        title: scriptName,
        output: formattedOutput,
        jobDetails: finalStatus,
      });

      if (finalStatus && finalStatus.status === 'SUCCEEDED') {
        setMessage({ type: 'success', text: `Command "${scriptName}" executed successfully!` });
      } else {
        setMessage({ type: 'error', text: `Command "${scriptName}" failed` });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute command';
      setMessage({ type: 'error', text: errorMessage });
      console.error(error);
    } finally {
      setExecuting(null);
    }
  };

  const pollJobStatus = async (jobId: string): Promise<any> => {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const statusResponse = await fetch(`/api/orchestrator/status?jobId=${jobId}`);
        const status = await statusResponse.json();
        
        if (status.status === 'SUCCEEDED' || status.status === 'FAILED' || status.status === 'CANCELED') {
          return status;
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }
    return null; // Timeout
  };

  const streamJobEvents = async (jobId: string) => {
    try {
      const ORCH_URL = process.env.NEXT_PUBLIC_ORCH_URL || 'http://localhost:4000';
      const eventSource = new EventSource(`${ORCH_URL}/v1/jobs/${jobId}/events`);
      
      eventSource.onmessage = (event) => {
        const logLine = event.data;
        setEventLogs((prev) => {
          const updated = [...prev, logLine];
          // Keep only last MAX_EVENT_LOGS lines
          return updated.slice(-MAX_EVENT_LOGS);
        });
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
      };

      // Clean up on completion (close after 60 seconds as a safety measure)
      setTimeout(() => {
        eventSource.close();
      }, 60000);
    } catch (error) {
      console.error('Failed to stream job events:', error);
    }
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
    fetchScripts();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" gutterBottom>
            Script Runner
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Execute scripts from the .run directory with environment parameters
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchScripts}
            disabled={loading}
          >
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

      {showFreeTextInput && (
        <Card sx={{ mb: 3, bgcolor: 'background.paper', border: '2px solid', borderColor: 'secondary.main' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Execute Custom Command
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Enter any docker compose command to execute through the orchestrator
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={3}
              value={freeTextCommand}
              onChange={(e) => setFreeTextCommand(e.target.value)}
              placeholder="e.g., docker compose --project-directory compose ps"
              disabled={executing !== null}
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={executeFreeText}
                disabled={executing !== null || !freeTextCommand.trim()}
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

      {/* Event Logs Panel */}
      {showEventLogs && eventLogs.length > 0 && (
        <Card sx={{ mb: 3, bgcolor: 'background.paper' }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                Execution Logs (Real-time)
              </Typography>
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setEventLogs([])}
                  sx={{ mr: 1 }}
                >
                  Clear
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowEventLogs(false)}
                >
                  Hide
                </Button>
              </Box>
            </Box>
            <Box
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
              {eventLogs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing last {Math.min(eventLogs.length, MAX_EVENT_LOGS)} lines (max {MAX_EVENT_LOGS})
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Build Image Scripts */}
      {scripts.filter(s => s.category === 'build-img').length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Build Images
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {scripts.filter(s => s.category === 'build-img').map((script) => (
              <Card key={script.name} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center">
                      <TerminalIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Tooltip title={script.command} arrow placement="top">
                        <Typography variant="h6" component="div" fontSize="0.95rem">
                          {script.name}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={copySuccess === script.name ? "Copied!" : "Copy command"} arrow>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(script.command, script.name)}
                        sx={{ ml: 1 }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {script.description}
                  </Typography>
                  <Chip
                    label={script.command.split(' ')[0]}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={
                      executing === script.name ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={() => executeScript(script.name, script.command)}
                    disabled={executing !== null}
                    fullWidth
                  >
                    {executing === script.name ? 'Executing...' : 'Execute'}
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {/* Multi-Container Scripts */}
      {scripts.filter(s => s.category === 'multi-cont').length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Multi-Container Orchestration
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {scripts.filter(s => s.category === 'multi-cont').map((script) => (
              <Card key={script.name} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center">
                      <TerminalIcon sx={{ mr: 1, color: 'secondary.main' }} />
                      <Tooltip title={script.command} arrow placement="top">
                        <Typography variant="h6" component="div" fontSize="0.95rem">
                          {script.name}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={copySuccess === script.name ? "Copied!" : "Copy command"} arrow>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(script.command, script.name)}
                        sx={{ ml: 1 }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {script.description}
                  </Typography>
                  <Chip
                    label={script.command.split(' ')[0]}
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={
                      executing === script.name ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={() => executeScript(script.name, script.command)}
                    disabled={executing !== null}
                    fullWidth
                  >
                    {executing === script.name ? 'Executing...' : 'Execute'}
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {/* Single-Container Scripts */}
      {scripts.filter(s => s.category === 'single-cont').length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Single Container
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {scripts.filter(s => s.category === 'single-cont').map((script) => (
              <Card key={script.name} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center">
                      <TerminalIcon sx={{ mr: 1, color: 'info.main' }} />
                      <Tooltip title={script.command} arrow placement="top">
                        <Typography variant="h6" component="div" fontSize="0.95rem">
                          {script.name}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={copySuccess === script.name ? "Copied!" : "Copy command"} arrow>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(script.command, script.name)}
                        sx={{ ml: 1 }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {script.description}
                  </Typography>
                  <Chip
                    label={script.command.split(' ')[0]}
                    size="small"
                    color="info"
                    variant="outlined"
                  />
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={
                      executing === script.name ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={() => executeScript(script.name, script.command)}
                    disabled={executing !== null}
                    fullWidth
                  >
                    {executing === script.name ? 'Executing...' : 'Execute'}
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {/* Test Scripts */}
      {scripts.filter(s => s.category === 'test').length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Tests
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
            {scripts.filter(s => s.category === 'test').map((script) => (
              <Card key={script.name} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center">
                      <TerminalIcon sx={{ mr: 1, color: 'success.main' }} />
                      <Tooltip title={script.command} arrow placement="top">
                        <Typography variant="h6" component="div" fontSize="0.95rem">
                          {script.name}
                        </Typography>
                      </Tooltip>
                    </Box>
                    <Tooltip title={copySuccess === script.name ? "Copied!" : "Copy command"} arrow>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(script.command, script.name)}
                        sx={{ ml: 1 }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    {script.description}
                  </Typography>
                  <Chip
                    label={script.command.split(' ')[0]}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={
                      executing === script.name ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <PlayArrowIcon />
                      )
                    }
                    onClick={() => executeScript(script.name, script.command)}
                    disabled={executing !== null}
                    fullWidth
                  >
                    {executing === script.name ? 'Executing...' : 'Execute'}
                  </Button>
                </CardActions>
              </Card>
            ))}
          </Box>
        </>
      )}

      {scripts.length === 0 && !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="body1" color="text.secondary">
            No scripts found with required prefixes ([build-img], [multi-cont], [single-cont], [test])
          </Typography>
        </Box>
      )}

      <Dialog
        open={outputDialog.open}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{outputDialog.title} - Output</DialogTitle>
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
