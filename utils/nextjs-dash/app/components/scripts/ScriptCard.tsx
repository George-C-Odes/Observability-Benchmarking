'use client';

import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';

import type { Script } from '@/app/hooks/useScripts';

type ScriptCardProps = {
  script: Script;
  executing: boolean;
  executeDisabled?: boolean;
  executeDisabledReason?: string;
  accentColor:
    | 'primary.main'
    | 'secondary.main'
    | 'info.main'
    | 'success.main';
  chipColor: 'primary' | 'secondary' | 'info' | 'success';
  copySuccess: boolean;
  onCopyAction: () => void;
  onExecuteAction: () => void;
};

export function ScriptCard({
  script,
  executing,
  executeDisabled,
  executeDisabledReason,
  accentColor,
  chipColor,
  copySuccess,
  onCopyAction,
  onExecuteAction,
}: ScriptCardProps) {
  return (
    <Card key={script.name} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center">
            <TerminalIcon sx={{ mr: 1, color: accentColor }} />
            <Tooltip title={script.command} arrow placement="top">
              <Typography variant="h6" component="div" fontSize="0.95rem">
                {script.name}
              </Typography>
            </Tooltip>
          </Box>
          <Tooltip title={copySuccess ? 'Copied!' : 'Copy command'} arrow>
            <IconButton size="small" onClick={onCopyAction} sx={{ ml: 1 }}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {script.description}
        </Typography>
        <Chip
          label={script.command.split(' ')[0]}
          size="small"
          color={chipColor}
          variant="outlined"
        />
      </CardContent>
      <CardActions>
        <Tooltip title={executeDisabledReason ?? ''} arrow disableHoverListener={!executeDisabled}>
          <span style={{ width: '100%' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              onClick={onExecuteAction}
              disabled={executing || Boolean(executeDisabled)}
              fullWidth
            >
              {executing ? 'Executing...' : 'Execute'}
            </Button>
          </span>
        </Tooltip>
      </CardActions>
    </Card>
  );
}
