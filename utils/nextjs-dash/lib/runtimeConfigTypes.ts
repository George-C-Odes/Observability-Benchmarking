/**
 * Shared runtime-config contracts.
 *
 * These configs are served by API routes (e.g. /api/script-runner/config) and
 * consumed by browser hooks. Keeping the types here avoids drift.
 */

export type ScriptRunnerRuntimeConfig = {
  maxExecutionLogLines: number;
  eventStreamTimeoutMs: number;
  debug: boolean;
};

export const DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG: ScriptRunnerRuntimeConfig = {
  maxExecutionLogLines: 500,
  eventStreamTimeoutMs: 30 * 60 * 1000,
  debug: false,
};

export type AppLogsRuntimeConfig = {
  clientMaxEntries: number;
  serverMaxEntries: number;
};

export const DEFAULT_APP_LOGS_RUNTIME_CONFIG: AppLogsRuntimeConfig = {
  clientMaxEntries: 400,
  serverMaxEntries: 500,
};
