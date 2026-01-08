import type { NextRequest } from 'next/server';

import { serverLogger } from './serverLogger';
import { withRequestContext } from './requestContext';
import { errorFromUnknown } from './apiResponses';

type Handler<TResponse> = (req: NextRequest) => Promise<TResponse> | TResponse;

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
export function withApiRoute<TResponse>(opts: WrapOpts, handler: Handler<TResponse>) {
  return async (req: NextRequest): Promise<TResponse> => {
    const incomingRid = req.headers.get('x-request-id') ?? undefined;

    return withRequestContext(async () => {
      const started = Date.now();
      const method = req.method;
      const url = req.nextUrl?.pathname ?? new URL(req.url).pathname;

      serverLogger.info(`[${opts.name}] ${method} ${url} start`, {
        requestId: incomingRid,
      });

      try {
        const res = await handler(req);
        serverLogger.info(`[${opts.name}] ${method} ${url} ok`, {
          tookMs: Date.now() - started,
        });
        return res;
      } catch (e) {
        serverLogger.error(`[${opts.name}] ${method} ${url} error`, e);
        // Default: internal error. Individual routes can still catch/return 400s.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return errorFromUnknown(500, e, 'Internal Server Error') as any;
      }
    }, incomingRid);
  };
}

