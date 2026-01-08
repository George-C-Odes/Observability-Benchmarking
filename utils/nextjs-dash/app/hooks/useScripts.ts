'use client';

import { getPublicConfig } from '@/lib/publicConfig';
import { useCallback, useEffect, useState } from 'react';

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

export function useScripts(): ScriptsState {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { orchestratorPublicUrl } = getPublicConfig();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = orchestratorPublicUrl ? `${orchestratorPublicUrl}/v1/commands` : '/api/scripts';
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('Failed to fetch scripts:', text);
        setError('Failed to load scripts');
        return;
      }

      if (orchestratorPublicUrl) {
        const data = (await response.json()) as Array<{ title: string; command: string; category: string; sourceFile: string }>;

        const mapped = data.map((p) => ({
          name: p.title,
          description: `${p.category} command`,
          command: p.command,
          category: p.category as Script['category'],
        }));

        setScripts(mapped);
      } else {
        const data = (await response.json()) as { scripts?: Script[] };
        setScripts(Array.isArray(data?.scripts) ? data.scripts : []);
      }
    } catch (e) {
      setError('Failed to load scripts');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [orchestratorPublicUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { scripts, loading, error, refresh };
}
