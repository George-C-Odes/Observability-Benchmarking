'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientLogger } from '@/lib/clientLogger';

/**
 * Return type for all runtime-config hooks produced by the factory.
 */
export type UseRuntimeConfigState<T> = {
  config: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Generic factory that creates a React hook for fetching and caching a
 * runtime-configuration object from an API endpoint.
 *
 * All four config hooks (AppLogs, Logging, ScriptRunner, ServiceActions)
 * previously duplicated the same ~50-line fetch/parse/error/loading/refresh
 * pattern. This factory encapsulates that pattern once (Open-Closed Principle)
 * and lets each config hook be expressed as a one-liner.
 *
 * @param endpoint  The API path (e.g. `/api/app-logs/config`).
 * @param defaults  The fallback config used before the first successful fetch.
 * @param parser    A function that normalizes the raw JSON response body into `T`.
 * @param label     A human-readable name used in error messages & client logging.
 */
export function createRuntimeConfigHook<T>(
  endpoint: string,
  defaults: T,
  parser: (json: unknown) => T,
  label: string,
): () => UseRuntimeConfigState<T> {
  const clientLogger = createClientLogger(label);

  return function useRuntimeConfig(): UseRuntimeConfigState<T> {
    const [config, setConfig] = useState<T>(defaults);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          clientLogger.error(`Failed to fetch ${label} config`, { status: res.status, bodyText: txt });
          setError(`Failed to load ${label} config`);
          return;
        }
        const json: unknown = await res.json();
        setConfig(parser(json));
      } catch (e) {
        clientLogger.error(`Failed to load ${label} config`, e);
        setError(`Failed to load ${label} config`);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    return useMemo(() => ({ config, loading, error, refresh }), [config, loading, error, refresh]);
  };
}