'use client';

import type { LoggingRuntimeConfig } from '@/lib/loggingTypes';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';
import { createRuntimeConfigHook } from './useRuntimeConfig';

export const useLoggingConfig = createRuntimeConfigHook<LoggingRuntimeConfig>(
  '/api/logging/config',
  DEFAULT_LOGGING_RUNTIME_CONFIG,
  (json) => {
    const j = json as Partial<LoggingRuntimeConfig>;
    return {
      clientLogLevel: (j.clientLogLevel ?? DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel) as LoggingRuntimeConfig['clientLogLevel'],
      serverLogLevel: (j.serverLogLevel ?? DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel) as LoggingRuntimeConfig['serverLogLevel'],
      serverLogOutput: (j.serverLogOutput ?? DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogOutput) as LoggingRuntimeConfig['serverLogOutput'],
    };
  },
  'Logging',
);