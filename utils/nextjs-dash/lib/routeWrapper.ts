import type { NextRequest } from 'next/server';

import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { envString } from '@/lib/env';
import { DEFAULT_LOGGING_RUNTIME_CONFIG } from '@/lib/loggingTypes';

import { getRequestId, withRequestContext } from './requestContext';
import { errorFromUnknown } from './apiResponses';

export type ApiRouteContext = {
  requestId: string;
};

type Handler<TResponse> = (req: NextRequest, ctx: ApiRouteContext) => Promise<TResponse> | TResponse;

type WrapOpts = {
  name: string;
  // If true, avoid logging request body/params etc. Not used yet, but easy to extend.
  sensitive?: boolean;
};

/**
 * Standard wrapper for Next.js route handlers:
 * - adds a per-request requestId (propagated via AsyncLocalStorage)
 * - logs start/end/error in a consistent way
 * - converts thrown errors into our standard error JSON response
 */
function applyServerLoggingFromEnv() {
  {
    const raw = envString('NEXTJS_DASH_SERVER_LOG_LEVEL', DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogLevel);
    const lvl = raw.trim().toLowerCase();
    if (lvl === 'debug' || lvl === 'info' || lvl === 'warn' || lvl === 'error' || lvl === 'silent') {
      globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__ = lvl;
    }
  }

  {
    const raw = envString(
      'NEXTJS_DASH_SERVER_LOG_OUTPUT',
      DEFAULT_LOGGING_RUNTIME_CONFIG.serverLogOutput
    );
    const mode = raw.trim().toLowerCase();
    if (mode === 'plain' || mode === 'json') {
      globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__ = mode;
    }
  }
}

export function withApiRoute<TResponse>(opts: WrapOpts, handler: Handler<TResponse>) {
  return async (req: NextRequest): Promise<TResponse> => {
    applyServerLoggingFromEnv();

    const incomingRid = req.headers.get('x-request-id') ?? undefined;

    return withRequestContext(async () => {
      const serverLogger = createScopedServerLogger(opts.name);
      const started = Date.now();
      const method = req.method;
      const url = req.nextUrl?.pathname ?? new URL(req.url).pathname;
      const requestId = getRequestId() ?? incomingRid ?? 'unknown-request-id';

      // Downgrade non-issue noisy endpoints to debug.
      const noisyPrefixes = new Set([
        'LOGGING_CONFIG_API',
        'HEALTH_API',
        'SCRIPT_RUNNER_CONFIG_API',
        'ENV_API',
        'APP_LOGS_CONFIG_API',
        'APP_HEALTH_API',
      ]);
      const logLevel: 'debug' | 'info' = noisyPrefixes.has(opts.name) ? 'debug' : 'info';

      serverLogger[logLevel](`${method} ${url} start`, {
        requestId,
        ...(incomingRid ? { incomingRequestId: incomingRid } : {}),
      });

      try {
        const ctx: ApiRouteContext = { requestId };
        const res = await handler(req, ctx);
        serverLogger[logLevel](`${method} ${url} ok`, {
          requestId,
          tookMs: Date.now() - started,
        });
        return res;
      } catch (e) {
        serverLogger.error(`${method} ${url} error`, e);
        // We deliberately always return our standard error response shape here.
        return errorFromUnknown(500, e, 'Internal Server Error') as unknown as TResponse;
      }
    }, incomingRid);
  };
}
