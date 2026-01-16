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
  /**
   * Whether the browser should poll /api/orchestrator/status while a job runs.
   * When false, the UI relies purely on the SSE event stream for status updates.
   */
  enableStatusPolling: boolean;
  /**
   * Status polling interval in milliseconds (only used when enableStatusPolling=true).
   */
  statusPollIntervalMs: number;
  /**
   * Max number of poll attempts (only used when enableStatusPolling=true).
   */
  statusPollMaxAttempts: number;
};

export const DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG: ScriptRunnerRuntimeConfig = {
  maxExecutionLogLines: 500,
  eventStreamTimeoutMs: 30 * 60 * 1000,
  debug: false,
  enableStatusPolling: false,
  statusPollIntervalMs: 1000,
  statusPollMaxAttempts: 12 * 60,
};

export type AppLogsRuntimeConfig = {
  clientMaxEntries: number;
  serverMaxEntries: number;
};

export const DEFAULT_APP_LOGS_RUNTIME_CONFIG: AppLogsRuntimeConfig = {
  clientMaxEntries: 400,
  serverMaxEntries: 500,
};
