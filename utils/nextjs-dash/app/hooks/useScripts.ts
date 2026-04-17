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

const clientLogger = createClientLogger('useScripts');

async function readScripts(): Promise<Script[]> {
  const response = await fetch(`/api/scripts`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Failed to load scripts (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as {
    scripts?: Array<{ name: string; description: string; command: string; category: string }>;
  };

  return (payload.scripts || []) as Script[];
}

export function useScripts(): ScriptsState {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setScripts(await readScripts());
    } catch (err) {
      clientLogger.error('Failed to fetch scripts', err);
      setError('Failed to load scripts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialScripts = async () => {
      try {
        const nextScripts = await readScripts();
        if (cancelled) return;

        setScripts(nextScripts);
      } catch (err) {
        if (cancelled) return;
        clientLogger.error('Failed to fetch scripts', err);
        setError('Failed to load scripts');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInitialScripts();

    return () => {
      cancelled = true;
    };
  }, []);

  return { scripts, loading, error, refresh };
}
