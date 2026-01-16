'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppLogsRuntimeConfig } from '@/lib/runtimeConfigTypes';
import { DEFAULT_APP_LOGS_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';
import { createClientLogger } from '@/lib/clientLogger';

export type UseAppLogsConfigState = {
  config: AppLogsRuntimeConfig;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const logger = createClientLogger('useAppLogsConfig');

export function useAppLogsConfig(): UseAppLogsConfigState {
  const [config, setConfig] = useState<AppLogsRuntimeConfig>(DEFAULT_APP_LOGS_RUNTIME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/app-logs/config', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        logger.error('Failed to fetch AppLogs config', { status: res.status, bodyText: txt });
        setError('Failed to load AppLogs config');
        return;
      }
      const json = (await res.json()) as Partial<AppLogsRuntimeConfig>;
      const next: AppLogsRuntimeConfig = {
        clientMaxEntries: Number(json.clientMaxEntries ?? DEFAULT_APP_LOGS_RUNTIME_CONFIG.clientMaxEntries),
        serverMaxEntries: Number(json.serverMaxEntries ?? DEFAULT_APP_LOGS_RUNTIME_CONFIG.serverMaxEntries),
      };
      setConfig(next);
    } catch (e) {
      logger.error('Failed to load AppLogs config', e);
      setError('Failed to load AppLogs config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ config, loading, error, refresh }), [config, loading, error, refresh]);
}
