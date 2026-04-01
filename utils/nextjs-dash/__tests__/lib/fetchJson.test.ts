import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, fetchJson } from '@/lib/fetchJson';

describe('HttpError', () => {
  it('stores status and bodyText', () => {
    const err = new HttpError(404, 'Not Found', '{"detail":"gone"}');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('HttpError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.bodyText).toBe('{"detail":"gone"}');
  });

  it('allows bodyText to be undefined', () => {
    const err = new HttpError(500, 'Internal');
    expect(err.bodyText).toBeUndefined();
  });
});

describe('fetchJson', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed JSON on a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    });

    const data = await fetchJson<{ hello: string }>('http://example.com/api');
    expect(data).toEqual({ hello: 'world' });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://example.com/api', undefined);
  });

  it('passes init options through to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const init: RequestInit = { method: 'POST', body: '{}' };
    await fetchJson('http://example.com/api', init);
    expect(globalThis.fetch).toHaveBeenCalledWith('http://example.com/api', init);
  });

  it('throws HttpError with body text on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('validation failed'),
    });

    try {
      await fetchJson('http://example.com/api');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.status).toBe(422);
      expect(err.bodyText).toBe('validation failed');
      expect(err.message).toBe('Request failed (422)');
    }
  });

  it('handles text() rejection gracefully on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('stream error')),
    });

    try {
      await fetchJson('http://example.com/api');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const err = e as HttpError;
      expect(err.status).toBe(500);
      expect(err.bodyText).toBe('');
    }
  });
});