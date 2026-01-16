import { okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { envNumber, envBool } from '@/lib/env';
import {
  DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG,
  type ScriptRunnerRuntimeConfig,
} from '@/lib/runtimeConfigTypes';

export const GET = withApiRoute({ name: 'SCRIPT_RUNNER_CONFIG_API' }, async function GET() {
  const payload: ScriptRunnerRuntimeConfig = {
    maxExecutionLogLines: envNumber(
      'SCRIPT_RUNNER_EXEC_LOG_MAX_LINES',
      DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.maxExecutionLogLines
    ),
    eventStreamTimeoutMs: envNumber(
      'SCRIPT_RUNNER_EVENT_STREAM_TIMEOUT_MS',
      DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.eventStreamTimeoutMs
    ),
    debug: DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.debug,
    enableStatusPolling: envBool(
      'SCRIPT_RUNNER_ENABLE_STATUS_POLLING',
      DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.enableStatusPolling
    ),
    statusPollIntervalMs: envNumber(
      'SCRIPT_RUNNER_STATUS_POLL_INTERVAL_MS',
      DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.statusPollIntervalMs,
      { min: 100 }
    ),
    statusPollMaxAttempts: envNumber(
      'SCRIPT_RUNNER_STATUS_POLL_MAX_ATTEMPTS',
      DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG.statusPollMaxAttempts,
      { min: 1 }
    ),
  };

  // Make sure clients don't cache this. We want it to reflect container env changes.
  return okJson(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
