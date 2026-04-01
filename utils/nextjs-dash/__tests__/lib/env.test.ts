import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { envNumber, envBool, envString } from '@/lib/env';

describe('env helpers', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.TEST_NUM;
    delete process.env.TEST_FALLBACK;
    delete process.env.TEST_BOOL;
    delete process.env.TEST_STR;
    delete process.env.TEST_STR_FALLBACK;
  });

  afterEach(() => {
    Object.assign(process.env, saved);
  });

  describe('envNumber', () => {
    it('returns default when env var is missing', () => {
      expect(envNumber('TEST_NUM', 42)).toBe(42);
    });

    it('returns default when env var is empty string', () => {
      process.env.TEST_NUM = '';
      expect(envNumber('TEST_NUM', 42)).toBe(42);
    });

    it('parses valid numbers', () => {
      process.env.TEST_NUM = '100';
      expect(envNumber('TEST_NUM', 42)).toBe(100);
    });

    it('returns default for non-numeric strings', () => {
      process.env.TEST_NUM = 'abc';
      expect(envNumber('TEST_NUM', 42)).toBe(42);
    });

    it('returns default when value is below min', () => {
      process.env.TEST_NUM = '0';
      expect(envNumber('TEST_NUM', 42, { min: 1 })).toBe(42);
    });

    it('respects custom min', () => {
      process.env.TEST_NUM = '5';
      expect(envNumber('TEST_NUM', 42, { min: 10 })).toBe(42);
    });

    it('uses fallbackName when primary is missing', () => {
      process.env.TEST_FALLBACK = '99';
      expect(envNumber('TEST_NUM', 42, { fallbackName: 'TEST_FALLBACK' })).toBe(99);
    });
  });

  describe('envBool', () => {
    it('returns default when env var is missing', () => {
      expect(envBool('TEST_BOOL')).toBe(false);
      expect(envBool('TEST_BOOL', true)).toBe(true);
    });

    it('returns default when env var is empty string', () => {
      process.env.TEST_BOOL = '';
      expect(envBool('TEST_BOOL', true)).toBe(true);
    });

    it.each(['true', '1', 'yes', 'y', 'on', 'TRUE', 'Yes', 'ON'])(
      'returns true for truthy value "%s"',
      (val) => {
        process.env.TEST_BOOL = val;
        expect(envBool('TEST_BOOL')).toBe(true);
      },
    );

    it.each(['false', '0', 'no', 'n', 'off', 'whatever'])(
      'returns false for non-truthy value "%s"',
      (val) => {
        process.env.TEST_BOOL = val;
        expect(envBool('TEST_BOOL')).toBe(false);
      },
    );
  });

  describe('envString', () => {
    it('returns default when env var is missing', () => {
      expect(envString('TEST_STR', 'fallback')).toBe('fallback');
    });

    it('returns default when env var is empty string', () => {
      process.env.TEST_STR = '';
      expect(envString('TEST_STR', 'fallback')).toBe('fallback');
    });

    it('returns env var value when set', () => {
      process.env.TEST_STR = 'hello';
      expect(envString('TEST_STR', 'fallback')).toBe('hello');
    });

    it('uses fallbackName when primary is missing', () => {
      process.env.TEST_STR_FALLBACK = 'alt';
      expect(envString('TEST_STR', 'default', { fallbackName: 'TEST_STR_FALLBACK' })).toBe('alt');
    });
  });
});