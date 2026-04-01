import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createClientLogger,
  setClientLogLevel,
  getClientLogLevel,
} from '@/lib/clientLogger';

describe('clientLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    // Reset to default level.
    setClientLogLevel('info');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up global.
    globalThis.__NEXTJS_DASH_CLIENT_LOG_LEVEL__ = undefined;
  });

  describe('setClientLogLevel / getClientLogLevel', () => {
    it('defaults to info when unset', () => {
      globalThis.__NEXTJS_DASH_CLIENT_LOG_LEVEL__ = undefined;
      expect(getClientLogLevel()).toBe('info');
    });

    it('stores and retrieves the level', () => {
      setClientLogLevel('error');
      expect(getClientLogLevel()).toBe('error');
    });
  });

  describe('createClientLogger', () => {
    it('logs info via console.log with correct prefix', () => {
      const logger = createClientLogger('test-scope');
      logger.info('hello', 42);
      expect(logSpy).toHaveBeenCalledWith('[client][test-scope]', 'hello', 42);
    });

    it('logs warn via console.warn', () => {
      const logger = createClientLogger('w');
      logger.warn('caution');
      expect(warnSpy).toHaveBeenCalledWith('[client][w]', 'caution');
    });

    it('logs error via console.error', () => {
      const logger = createClientLogger('e');
      logger.error('fail');
      expect(errorSpy).toHaveBeenCalledWith('[client][e]', 'fail');
    });

    it('logs debug via console.debug', () => {
      setClientLogLevel('debug');
      const logger = createClientLogger('d');
      logger.debug('trace');
      expect(debugSpy).toHaveBeenCalledWith('[client][d]', 'trace');
    });
  });

  describe('level filtering', () => {
    it('suppresses debug when level is info', () => {
      setClientLogLevel('info');
      const logger = createClientLogger('test');
      logger.debug('should not appear');
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('suppresses info and debug when level is warn', () => {
      setClientLogLevel('warn');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('yes');
      logger.error('yes');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('suppresses everything below error when level is error', () => {
      setClientLogLevel('error');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('suppresses everything when level is silent', () => {
      setClientLogLevel('silent');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('no');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});