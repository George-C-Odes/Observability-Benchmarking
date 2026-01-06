'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';

interface EnvVariable {
  key: string;
  value: string;
  comment?: string;
}

export default function EnvEditor() {
  const [envContent, setEnvContent] = useState('');
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchEnvFile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/env');
      if (!response.ok) throw new Error('Failed to fetch environment file');
      const data = await response.json();
      setEnvContent(data.content);
      parseEnvContent(data.content);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load environment file' });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const parseEnvContent = (content: string) => {
    // Note: This project uses YAML-style "KEY: VALUE" format, not standard "KEY=VALUE"
    const lines = content.split('\n');
    const variables: EnvVariable[] = [];
    let currentComment = '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#')) {
        currentComment = trimmed.substring(1).trim();
      } else if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        variables.push({
          key: key.trim(),
          value,
          comment: currentComment,
        });
        currentComment = '';
      } else if (trimmed === '') {
        currentComment = '';
      }
    });

    setEnvVariables(variables);
  };

  const handleVariableChange = (index: number, newValue: string) => {
    const updated = [...envVariables];
    updated[index].value = newValue;
    setEnvVariables(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Reconstruct the env file content
      const lines = envContent.split('\n');
      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.includes(':')) {
          const [key] = trimmed.split(':');
          const variable = envVariables.find((v) => v.key === key.trim());
          if (variable) {
            return `${variable.key}: ${variable.value}`;
          }
        }
        return line;
      });

      const newContent = newLines.join('\n');

      const response = await fetch('/api/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });

      if (!response.ok) throw new Error('Failed to save environment file');

      setMessage({ type: 'success', text: 'Environment file saved successfully!' });
      setEnvContent(newContent);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save environment file' });
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchEnvFile();
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
      <Typography variant="h5" gutterBottom>
        Environment Configuration Editor
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Edit the configuration values for the compose/.env file
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Stack spacing={2} sx={{ mb: 3 }}>
        {envVariables.map((variable, index) => (
          <Box key={index}>
            {variable.comment && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                {variable.comment}
              </Typography>
            )}
            <TextField
              fullWidth
              label={variable.key}
              value={variable.value}
              onChange={(e) => handleVariableChange(index, e.target.value)}
              variant="outlined"
              size="small"
            />
          </Box>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Save Changes
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchEnvFile}
          disabled={loading || saving}
        >
          Reload
        </Button>
      </Stack>
    </Box>
  );
}
