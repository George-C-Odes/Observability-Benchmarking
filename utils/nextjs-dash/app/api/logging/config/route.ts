import { okJson } from '@/lib/apiResponses';
import { envString } from '@/lib/env';
import { withApiRoute } from '@/lib/routeWrapper';
import {
  DEFAULT_LOGGING_RUNTIME_CONFIG,
  type LoggingRuntimeConfig,
  type RuntimeLogLevel,
  type ServerLogOutput,
} from '@/lib/loggingTypes';

function normalizeLevel(v: string | undefined, fallback: RuntimeLogLevel): RuntimeLogLevel {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'debug' || s === 'info' || s === 'warn' || s === 'error' || s === 'silent') return s;
  return fallback;
}

function normalizeOutput(v: string | undefined, fallback: ServerLogOutput): ServerLogOutput {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'plain' || s === 'json') return s;
  return fallback;
}

/**
 * GET /api/logging/config
 * Runtime logging configuration. Polled by the client.
 */
export const GET = withApiRoute({ name: 'LOGGING_CONFIG_API' }, async function GET() {
  const payload: LoggingRuntimeConfig = {
    clientLogLevel: normalizeLevel(
      envString('NEXTJS_DASH_CLIENT_LOG_LEVEL', DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel),
      DEFAULT_LOGGING_RUNTIME_CONFIG.clientLogLevel
    ),
    serverLogLevel: normalizeLevel(
      envString('NEXTJS_DASH_SERVER_LOG_LEVEL', DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel),
      DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel
    ),
    serverLogOutput: normalizeOutput(
      envString('NEXTJS_DASH_SERVER_LOG_OUTPUT', DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogOutput),
      DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogOutput
    ),
  };

  return okJson(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
