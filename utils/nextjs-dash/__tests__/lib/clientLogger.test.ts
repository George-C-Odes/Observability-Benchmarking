import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createClientLogger,
  setClientLogLevel,
  getClientLogLevel,
} from '@/lib/clientLogger';
import { silenceConsole, type ConsoleSpy } from '@/__tests__/_helpers/consoleSpy';

describe('clientLogger', () => {
  let spies: ConsoleSpy;

  beforeEach(() => {
    spies = silenceConsole();
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
      expect(spies.log).toHaveBeenCalledWith('[client][test-scope]', 'hello', 42);
    });

    it('logs warn via console.warn', () => {
      const logger = createClientLogger('w');
      logger.warn('caution');
      expect(spies.warn).toHaveBeenCalledWith('[client][w]', 'caution');
    });

    it('logs error via console.error', () => {
      const logger = createClientLogger('e');
      logger.error('fail');
      expect(spies.error).toHaveBeenCalledWith('[client][e]', 'fail');
    });

    it('logs debug via console.debug', () => {
      setClientLogLevel('debug');
      const logger = createClientLogger('d');
      logger.debug('trace');
      expect(spies.debug).toHaveBeenCalledWith('[client][d]', 'trace');
    });
  });

  describe('level filtering', () => {
    it('suppresses debug when level is info', () => {
      setClientLogLevel('info');
      const logger = createClientLogger('test');
      logger.debug('should not appear');
      expect(spies.debug).not.toHaveBeenCalled();
    });

    it('suppresses info and debug when level is warn', () => {
      setClientLogLevel('warn');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('yes');
      logger.error('yes');
      expect(spies.debug).not.toHaveBeenCalled();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).toHaveBeenCalledTimes(1);
      expect(spies.error).toHaveBeenCalledTimes(1);
    });

    it('suppresses everything below error when level is error', () => {
      setClientLogLevel('error');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');
      expect(spies.debug).not.toHaveBeenCalled();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).toHaveBeenCalledTimes(1);
    });

    it('suppresses everything when level is silent', () => {
      setClientLogLevel('silent');
      const logger = createClientLogger('test');
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('no');
      expect(spies.debug).not.toHaveBeenCalled();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
      expect(spies.error).not.toHaveBeenCalled();
    });
  });
});