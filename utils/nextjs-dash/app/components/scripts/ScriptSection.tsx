'use client';

import { Box, Typography } from '@mui/material';

import type { Script } from '@/app/hooks/useScripts';
import { ScriptCard } from './ScriptCard';

type ScriptSectionProps = {
  title: string;
  scripts: Script[];
  executingName: string | null;
  copySuccessFor: string | null;
  accentColor:
    | 'primary.main'
    | 'secondary.main'
    | 'info.main'
    | 'success.main';
  chipColor: 'primary' | 'secondary' | 'info' | 'success';
  onCopyAction: (script: Script) => void;
  onExecuteAction: (script: Script) => void;
};

export function ScriptSection({
  title,
  scripts,
  executingName,
  copySuccessFor,
  accentColor,
  chipColor,
  onCopyAction,
  onExecuteAction,
}: ScriptSectionProps) {
  if (!scripts.length) return null;

  return (
    <>
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {scripts.map((script) => (
          <ScriptCard
            key={script.name}
            script={script}
            executing={executingName === script.name}
            accentColor={accentColor}
            chipColor={chipColor}
            copySuccess={copySuccessFor === script.name}
            onCopyAction={() => onCopyAction(script)}
            onExecuteAction={() => onExecuteAction(script)}
          />
        ))}
      </Box>
    </>
  );
}
