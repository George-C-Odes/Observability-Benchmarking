import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';

const DEFAULT_TIMEOUT_MS = 2000;

function hasName(value: unknown): value is { name: unknown } {
  return typeof value === 'object' && value !== null && 'name' in value;
}

function isAbortError(e: unknown) {
  const name =
    e instanceof Error
      ? e.name
      : hasName(e) && typeof e.name === 'string'
        ? e.name
        : undefined;

  return (
    name === 'AbortError' ||
    (e instanceof Error && e.message.toLowerCase().includes('aborted'))
  );
}

/** FOR FUTURE USE
 *
 * Minimal upstream probe endpoint.
 *
 * Why:
 * - Avoids browser CORS issues by probing from the Next.js server.
 * - Avoids downloading payload by using HEAD when supported.
 *
 * Query params:
 * - url: string (required)
 * - timeoutMs: number (optional, default 2000)
 */
export const GET = withApiRoute({ name: 'PROBE_API' }, async function GET(request: Request) {
  const serverLogger = createScopedServerLogger('PROBE_API');

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const timeoutMsRaw = searchParams.get('timeoutMs');
    const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : DEFAULT_TIMEOUT_MS;

    if (!url) {
      return errorJson(400, { error: 'Missing required query param: url' });
    }

    // Basic safety: only allow http/https.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return errorJson(400, { error: 'Invalid url' });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return errorJson(400, { error: 'Only http/https URLs are allowed' });
    }

    const started = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);

    try {
      // Prefer HEAD so we don't fetch the payload.
      serverLogger.debug('Probing upstream (HEAD)', { url: parsed.toString(), timeoutMs });
      let upstream = await fetch(parsed.toString(), {
        method: 'HEAD',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      });

      // Some servers don't implement HEAD; fall back to a minimal GET.
      if (upstream.status === 405 || upstream.status === 501) {
        serverLogger.debug('Upstream does not support HEAD, falling back to GET', {
          url: parsed.toString(),
          status: upstream.status,
        });

        upstream = await fetch(parsed.toString(), {
          method: 'GET',
          cache: 'no-store',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            // Hint we only need a tiny response; many servers support Range.
            Range: 'bytes=0-0',
          },
        });
      }

      const durationMs = Date.now() - started;

      serverLogger.debug('Upstream probe complete', {
        url: parsed.toString(),
        status: upstream.status,
        ok: upstream.ok,
        durationMs,
      });

      // Always 200 for probe endpoint; caller uses status field.
      return okJson(
        {
          ok: upstream.ok,
          status: upstream.status,
          durationMs,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      const durationMs = Date.now() - started;
      if (isAbortError(error)) {
        serverLogger.debug('Upstream probe timed out', {
          url: parsed.toString(),
          timeoutMs,
          durationMs,
        });

        return okJson(
          {
            ok: false,
            status: 0,
            durationMs,
            timedOut: true,
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      serverLogger.error('Upstream probe failed', {
        url: parsed.toString(),
        durationMs,
        error,
      });

      // Return a standard error response for easier browser-side troubleshooting.
      return errorFromUnknown(500, error, 'Failed to probe upstream URL');
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    return errorFromUnknown(500, error, 'Failed to probe upstream URL');
  }
});
