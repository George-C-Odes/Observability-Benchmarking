'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientLogger } from '@/lib/clientLogger';
import {
  DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG,
  type ServiceActionsRuntimeConfig,
} from '@/lib/runtimeConfigTypes';

const clientLogger = createClientLogger('useServiceActionsConfig');

export type UseServiceActionsConfigState = {
  config: ServiceActionsRuntimeConfig;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useServiceActionsConfig(): UseServiceActionsConfigState {
  const [config, setConfig] = useState<ServiceActionsRuntimeConfig>(DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/service-actions/config', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        clientLogger.error('Failed to fetch service actions config', { status: res.status, bodyText: txt });
        setError('Failed to load service actions config');
        return;
      }

      const json = (await res.json()) as Partial<ServiceActionsRuntimeConfig>;
      setConfig({
        enabled: (json.enabled ?? DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG.enabled) as Record<string, boolean>,
      });
    } catch (e) {
      clientLogger.error('Failed to load service actions config', e);
      setError('Failed to load service actions config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ config, loading, error, refresh }), [config, loading, error, refresh]);
}
