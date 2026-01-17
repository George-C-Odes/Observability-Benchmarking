'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScriptRunnerRuntimeConfig } from '@/lib/runtimeConfigTypes';
import { DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';
import { createClientLogger } from '@/lib/clientLogger';

const clientLogger = createClientLogger('useScriptRunnerConfig');

export type UseScriptRunnerConfigState = {
  config: ScriptRunnerRuntimeConfig;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useScriptRunnerConfig(): UseScriptRunnerConfigState {
  const [config, setConfig] = useState<ScriptRunnerRuntimeConfig>(DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/script-runner/config', { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        clientLogger.error('Failed to fetch ScriptRunner config', { status: res.status, bodyText: txt });
        setError('Failed to load ScriptRunner config');
        return;
      }
      const json = (await res.json()) as Partial<ScriptRunnerRuntimeConfig>;
      setConfig({
        maxExecutionLogLines: Number(json.maxExecutionLogLines ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.maxExecutionLogLines),
        eventStreamTimeoutMs: Number(json.eventStreamTimeoutMs ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.eventStreamTimeoutMs),
        debug: Boolean(json.debug ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.debug),
      });
    } catch (e) {
      clientLogger.error('Failed to load ScriptRunner config', e);
      setError('Failed to load ScriptRunner config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ config, loading, error, refresh }), [config, loading, error, refresh]);
}
