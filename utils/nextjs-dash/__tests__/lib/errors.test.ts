import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '@/lib/errors';

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns fallback when Error has empty message', () => {
    expect(getErrorMessage(new Error(''))).toBe('Unknown error');
  });

  it('returns custom fallback when Error has empty message', () => {
    expect(getErrorMessage(new Error(''), 'oops')).toBe('oops');
  });

  it('returns string errors as-is', () => {
    expect(getErrorMessage('something went wrong')).toBe('something went wrong');
  });

  it('returns default fallback for non-string, non-Error values', () => {
    expect(getErrorMessage(42)).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('returns custom fallback for non-string, non-Error values', () => {
    expect(getErrorMessage({ foo: 1 }, 'custom')).toBe('custom');
  });
});