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
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';

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
  const [outputDialog, setOutputDialog] = useState<{ open: boolean; title: string; output: string }>({
    open: false,
    title: '',
    output: '',
  });

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
    try {
      const response = await fetch('/api/scripts/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptName, command }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute script');
      }

      setOutputDialog({
        open: true,
        title: scriptName,
        output: data.output || 'Script executed successfully',
      });

      setMessage({ type: 'success', text: `Script "${scriptName}" executed successfully!` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute script';
      setMessage({ type: 'error', text: errorMessage });
      console.error(error);
    } finally {
      setExecuting(null);
    }
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
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchScripts}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
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
                  <Box display="flex" alignItems="center" mb={1}>
                    <TerminalIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="h6" component="div" fontSize="0.95rem">
                      {script.name}
                    </Typography>
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
                  <Box display="flex" alignItems="center" mb={1}>
                    <TerminalIcon sx={{ mr: 1, color: 'secondary.main' }} />
                    <Typography variant="h6" component="div" fontSize="0.95rem">
                      {script.name}
                    </Typography>
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
                  <Box display="flex" alignItems="center" mb={1}>
                    <TerminalIcon sx={{ mr: 1, color: 'info.main' }} />
                    <Typography variant="h6" component="div" fontSize="0.95rem">
                      {script.name}
                    </Typography>
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
                  <Box display="flex" alignItems="center" mb={1}>
                    <TerminalIcon sx={{ mr: 1, color: 'success.main' }} />
                    <Typography variant="h6" component="div" fontSize="0.95rem">
                      {script.name}
                    </Typography>
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
