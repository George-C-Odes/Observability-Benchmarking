export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type ServerLogOutput = 'plain' | 'json';

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

  /**
   * Server stdout/stderr emission format.
   * - json: a single JSON line (good for log scrapers like Grafana Alloy/Loki)
   * - plain: the legacy console output (more human-friendly)
   */
  serverLogOutput: ServerLogOutput;
};

export const DEFAULT_LOGGING_RUNTIME_CONFIG: LoggingRuntimeConfig = {
  clientLogLevel: 'info',
  serverLogLevel: 'info',
  serverLogOutput: 'plain',
} as const;
