'use client';

import {
  DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG,
  type ServiceActionsRuntimeConfig,
} from '@/lib/runtimeConfigTypes';
import { createRuntimeConfigHook } from './useRuntimeConfig';

export const useServiceActionsConfig = createRuntimeConfigHook<ServiceActionsRuntimeConfig>(
  '/api/service-actions/config',
  DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG,
  (json) => {
    const j = json as Partial<ServiceActionsRuntimeConfig>;
    return {
      enabled: (j.enabled ?? DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG.enabled) as Record<string, boolean>,
    };
  },
  'ServiceActions',
);