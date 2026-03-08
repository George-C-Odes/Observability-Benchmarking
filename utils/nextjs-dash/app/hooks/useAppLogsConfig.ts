'use client';

import type { AppLogsRuntimeConfig } from '@/lib/runtimeConfigTypes';
import { DEFAULT_APP_LOGS_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';
import { createRuntimeConfigHook } from './useRuntimeConfig';

export const useAppLogsConfig = createRuntimeConfigHook<AppLogsRuntimeConfig>(
  '/api/app-logs/config',
  DEFAULT_APP_LOGS_RUNTIME_CONFIG,
  (json) => {
    const j = json as Partial<AppLogsRuntimeConfig>;
    return {
      clientMaxEntries: Number(j.clientMaxEntries ?? DEFAULT_APP_LOGS_RUNTIME_CONFIG.clientMaxEntries),
      serverMaxEntries: Number(j.serverMaxEntries ?? DEFAULT_APP_LOGS_RUNTIME_CONFIG.serverMaxEntries),
    };
  },
  'AppLogs',
);