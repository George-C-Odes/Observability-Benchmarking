import { okJson } from '@/lib/apiResponses';
import { envString } from '@/lib/env';
import { withApiRoute } from '@/lib/routeWrapper';
import {
  DEFAULT_LOGGING_RUNTIME_CONFIG,
  type LoggingRuntimeConfig,
  type RuntimeLogLevel,
} from '@/lib/loggingTypes';

function normalizeLevel(v: string | undefined, fallback: RuntimeLogLevel): RuntimeLogLevel {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'debug' || s === 'info' || s === 'warn' || s === 'error' || s === 'silent') return s;
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
  };

  return okJson(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
