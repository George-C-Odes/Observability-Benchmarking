import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted by Vitest) ──────────────────────────────────

vi.mock('@/lib/scopedServerLogger', () => ({
  createScopedServerLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/lib/env', () => ({
  envString: vi.fn((_name: string, defaultValue: string) => defaultValue),
}));

vi.mock('@/lib/loggingTypes', () => ({
  DEFAULT_LOGGING_RUNTIME_CONFIG: {
    clientLogLevel: 'info',
    serverLogLevel: 'info',
    serverLogOutput: 'plain',
  },
}));

vi.mock('@/lib/apiResponses', () => ({
  errorFromUnknown: vi.fn(
    (status: number, _error: unknown, fallbackMessage: string) => ({
      __mocked: true,
      status,
      fallbackMessage,
    }),
  ),
}));

// ── Imports (resolved to mocked modules) ──────────────────────────────

import { withApiRoute } from '@/lib/routeWrapper';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { envString } from '@/lib/env';
import { errorFromUnknown } from '@/lib/apiResponses';
import type { NextRequest } from 'next/server';

// ── Helpers ───────────────────────────────────────────────────────────

function fakeRequest(
  method = 'GET',
  pathname = '/api/test',
  headers: Record<string, string> = {},
): NextRequest {
  const url = new URL(pathname, 'http://localhost:3001');
  return {
    method,
    url: url.toString(),
    nextUrl: { pathname },
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

// ── Setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset globalThis overrides set by applyServerLoggingFromEnv
  delete (globalThis as Record<string, unknown>).__NEXTJS_DASH_SERVER_LOG_LEVEL__;
  delete (globalThis as Record<string, unknown>).__NEXTJS_DASH_SERVER_LOG_OUTPUT__;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('withApiRoute', () => {
  it('calls the handler and returns its response', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, data: 'hello' });
    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);

    const req = fakeRequest('GET', '/api/test');
    const result = await wrapped(req);

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, data: 'hello' });
  });

  it('passes a requestId context to the handler', async () => {
    const handler = vi.fn((_req: NextRequest, ctx: { requestId: string }) => {
      expect(typeof ctx.requestId).toBe('string');
      expect(ctx.requestId.length).toBeGreaterThan(0);
      return Promise.resolve({ ok: true });
    });

    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);
    await wrapped(fakeRequest());
    expect(handler).toHaveBeenCalledOnce();
  });

  it('uses the incoming x-request-id header when present', async () => {
    const handler = vi.fn((_req: NextRequest, ctx: { requestId: string }) => {
      expect(ctx.requestId).toBe('custom-rid-456');
      return Promise.resolve({ ok: true });
    });

    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);
    await wrapped(fakeRequest('POST', '/api/test', { 'x-request-id': 'custom-rid-456' }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('creates a scoped logger with the route name', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'MY_ROUTE' }, handler);
    await wrapped(fakeRequest());

    expect(createScopedServerLogger).toHaveBeenCalledWith('MY_ROUTE');
  });

  it('logs at info level for non-noisy endpoints', async () => {
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(createScopedServerLogger).mockReturnValue(mockLogger as unknown as ReturnType<typeof createScopedServerLogger>);

    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'CUSTOM_API' }, handler);
    await wrapped(fakeRequest('GET', '/api/custom'));

    // Should log start and ok at info level (not debug)
    expect(mockLogger.info).toHaveBeenCalledTimes(2);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/custom start'),
      expect.any(Object),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/custom ok'),
      expect.any(Object),
    );
  });

  it('logs at debug level for noisy endpoints', async () => {
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(createScopedServerLogger).mockReturnValue(mockLogger as unknown as ReturnType<typeof createScopedServerLogger>);

    const handler = vi.fn().mockResolvedValue({ ok: true });

    const noisyNames = ['LOGGING_CONFIG_API', 'HEALTH_API', 'ENV_API', 'APP_HEALTH_API'];
    for (const name of noisyNames) {
      vi.clearAllMocks();
      vi.mocked(createScopedServerLogger).mockReturnValue(mockLogger as unknown as ReturnType<typeof createScopedServerLogger>);

      const wrapped = withApiRoute({ name }, handler);
      await wrapped(fakeRequest('GET', `/api/${name}`));

      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).not.toHaveBeenCalled();
    }
  });

  it('catches handler errors and returns an error response', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapped = withApiRoute({ name: 'ERR_API' }, handler);

    const result = await wrapped(fakeRequest('POST', '/api/error'));

    expect(errorFromUnknown).toHaveBeenCalledWith(
      500,
      expect.any(Error),
      'Internal Server Error',
    );
    // The mock returns a structured object
    expect(result).toEqual(expect.objectContaining({ __mocked: true, status: 500 }));
  });

  it('logs the error when the handler throws', async () => {
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(createScopedServerLogger).mockReturnValue(mockLogger as unknown as ReturnType<typeof createScopedServerLogger>);

    const err = new Error('kaboom');
    const handler = vi.fn().mockRejectedValue(err);
    const wrapped = withApiRoute({ name: 'ERR_API' }, handler);

    await wrapped(fakeRequest('PUT', '/api/fail'));

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('PUT /api/fail error'),
      err,
    );
  });

  it('calls applyServerLoggingFromEnv on each request', async () => {
    vi.mocked(envString).mockImplementation((name: string, defaultValue: string) => {
      if (name === 'NEXTJS_DASH_SERVER_LOG_LEVEL') return 'debug';
      if (name === 'NEXTJS_DASH_SERVER_LOG_OUTPUT') return 'json';
      return defaultValue;
    });

    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);
    await wrapped(fakeRequest());

    expect(globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__).toBe('debug');
    expect(globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__).toBe('json');
  });

  it('ignores invalid log level from env', async () => {
    vi.mocked(envString).mockImplementation((name: string, defaultValue: string) => {
      if (name === 'NEXTJS_DASH_SERVER_LOG_LEVEL') return 'INVALID_LEVEL';
      return defaultValue;
    });

    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);
    await wrapped(fakeRequest());

    // Should not have been set because 'INVALID_LEVEL' is not valid
    expect(globalThis.__NEXTJS_DASH_SERVER_LOG_LEVEL__).toBeUndefined();
  });

  it('ignores invalid log output mode from env', async () => {
    vi.mocked(envString).mockImplementation((name: string, defaultValue: string) => {
      if (name === 'NEXTJS_DASH_SERVER_LOG_OUTPUT') return 'xml';
      return defaultValue;
    });

    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'TEST_API' }, handler);
    await wrapped(fakeRequest());

    expect(globalThis.__NEXTJS_DASH_SERVER_LOG_OUTPUT__).toBeUndefined();
  });

  it('includes tookMs in the success log', async () => {
    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.mocked(createScopedServerLogger).mockReturnValue(mockLogger as unknown as ReturnType<typeof createScopedServerLogger>);

    const handler = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = withApiRoute({ name: 'TIMER_API' }, handler);
    await wrapped(fakeRequest());

    const okCall = mockLogger.info.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ok'),
    );
    expect(okCall).toBeDefined();
    expect(okCall![1]).toHaveProperty('tookMs');
    expect(typeof okCall![1].tookMs).toBe('number');
  });

  it('works with a synchronous handler', async () => {
    const handler = vi.fn(() => ({ sync: true }));
    const wrapped = withApiRoute({ name: 'SYNC_API' }, handler);

    const result = await wrapped(fakeRequest());
    expect(result).toEqual({ sync: true });
  });
});