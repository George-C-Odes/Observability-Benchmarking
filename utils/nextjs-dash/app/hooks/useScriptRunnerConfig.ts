'use client';

import type { ScriptRunnerRuntimeConfig } from '@/lib/runtimeConfigTypes';
import { DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG } from '@/lib/runtimeConfigTypes';
import { createRuntimeConfigHook } from './useRuntimeConfig';

export const useScriptRunnerConfig = createRuntimeConfigHook<ScriptRunnerRuntimeConfig>(
  '/api/script-runner/config',
  DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG,
  (json) => {
    const j = json as Partial<ScriptRunnerRuntimeConfig>;
    return {
      maxExecutionLogLines: Number(j.maxExecutionLogLines ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.maxExecutionLogLines),
      eventStreamTimeoutMs: Number(j.eventStreamTimeoutMs ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.eventStreamTimeoutMs),
      debug: Boolean(j.debug ?? DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.debug),
    };
  },
  'ScriptRunner',
);