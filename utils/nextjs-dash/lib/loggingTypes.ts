export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type LoggingRuntimeConfig = {
  /**
   * Client-side log level gate.
   * Affects createClientLogger() output.
   */
  clientLogLevel: RuntimeLogLevel;

  /**
   * Server-side log level gate.
   * Affects serverLogger container output + server log buffer.
   */
  serverLogLevel: RuntimeLogLevel;
};

export const DEFAULT_LOGGING_RUNTIME_CONFIG: LoggingRuntimeConfig = {
  clientLogLevel: 'info',
  serverLogLevel: 'info',
} as const;

