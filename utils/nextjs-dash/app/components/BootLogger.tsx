'use client';

import { useEffect } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { createClientLogger, setClientLogLevel } from '@/lib/clientLogger';
import { useLoggingConfig } from '@/app/hooks/useLoggingConfig';
import { collectClientSystemInfo } from '@/lib/systemInfo';
import { getRuntimeConfig } from '@/lib/runtimeConfig';

export function BootLogger() {
  const { config: loggingConfig } = useLoggingConfig();

  useEffect(() => {
    setClientLogLevel(loggingConfig.clientLogLevel);
  }, [loggingConfig.clientLogLevel]);

  useEffect(() => {
    const logger = createClientLogger('Boot');

    // Defer logging slightly to avoid competing with hydration/layout.
    const id = window.setTimeout(() => {
      const { systemInfo } = getRuntimeConfig();
      const clientInfo = collectClientSystemInfo();

      // Log in the same order as the SystemInfo page:
      // 1) server info
      // 2) client info
      if (systemInfo) {
        logger.info('System info (server)', systemInfo);
      } else {
        logger.warn('System info (server) not available');
      }
      logger.info('System info (client)', clientInfo);

      // Also fetch server logs snapshot so the Logs tab has something even if opened later.
      void fetchJson<{ entries?: unknown[] }>('/api/logs')
        .then((data) => {
          if (Array.isArray(data?.entries) && data.entries.length) {
            logger.info('Loaded server log entries snapshot', { count: data.entries.length });
          }
        })
        .catch(() => {
          // ignore
        });
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  return null;
}
