'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LoggingRuntimeConfig } from '@/lib/loggingTypes';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';
import { createClientLogger } from '@/lib/clientLogger';

const clientLogger = createClientLogger('useLoggingConfig');

export type UseLoggingConfigState = {
  config: LoggingRuntimeConfig;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useLoggingConfig(): UseLoggingConfigState {
  const [config, setConfig] = useState<LoggingRuntimeConfig>(DEFAULT_LOGGING_RUNTIME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/logging/config', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        clientLogger.error('Failed to fetch logging config', { status: res.status, bodyText: txt });
        setError('Failed to load logging config');
        return;
      }

      const json = (await res.json()) as Partial<LoggingRuntimeConfig>;
      setConfig({
        clientLogLevel: (json.clientLogLevel ?? DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel) as LoggingRuntimeConfig['clientLogLevel'],
        serverLogLevel: (json.serverLogLevel ?? DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel) as LoggingRuntimeConfig['serverLogLevel'],
      });
    } catch (e) {
      clientLogger.error('Failed to load logging config', e);
      setError('Failed to load logging config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ config, loading, error, refresh }), [config, loading, error, refresh]);
}
