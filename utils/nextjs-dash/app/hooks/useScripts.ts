'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClientLogger } from '@/lib/clientLogger';

export interface Script {
  name: string;
  description: string;
  command: string;
  category: 'build-img' | 'multi-cont' | 'single-cont' | 'test';
}

export type ScriptsState = {
  scripts: Script[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const logger = createClientLogger('useScripts');

export function useScripts(): ScriptsState {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/scripts`);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.error('Failed to fetch scripts', { status: response.status, bodyText: text });
        setError('Failed to load scripts');
        return;
      }

      const payload = (await response.json()) as { scripts?: Array<{ name: string; description: string; command: string; category: string }> };
      setScripts((payload.scripts || []) as Script[]);
    } catch (e) {
      logger.error('Failed to fetch scripts', e);
      setError('Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { scripts, loading, error, refresh };
}
