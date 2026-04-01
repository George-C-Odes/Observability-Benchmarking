import { describe, expect, it } from 'vitest';
import { withRequestContext, getRequestContext, getRequestId } from '@/lib/requestContext';

describe('requestContext', () => {
  it('withRequestContext generates a UUID when none is provided', () => {
    const result = withRequestContext(() => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      return ctx!.requestId;
    });

    expect(typeof result).toBe('string');
  });

  it('withRequestContext uses the provided requestId', () => {
    const rid = 'custom-id-123';
    withRequestContext(() => {
      expect(getRequestId()).toBe(rid);
    }, rid);
  });

  it('getRequestContext returns undefined outside a context', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('getRequestId returns undefined outside a context', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('contexts do not leak across separate runs', () => {
    withRequestContext(() => {
      expect(getRequestId()).toBeDefined();
    }, 'run-a');

    withRequestContext(() => {
      expect(getRequestId()).toBe('run-b');
    }, 'run-b');
  });
});