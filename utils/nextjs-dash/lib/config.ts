/**
 * Centralized configuration for the Next.js dashboard application.
 * All environment variables and constants are managed here.
 */

/**
 * Orchestrator service configuration
 */
export const orchestratorConfig = {
  url: process.env.ORCH_URL || 'http://orchestrator:3002',
  apiKey: process.env.ORCH_API_KEY || 'dev-change-me',
  timeout: 60000, // 60 seconds
} as const;

/**
 * Application configuration
 */
export const appConfig = {
  name: 'Observability Benchmarking Dashboard',
  version: '1.0.0',
} as const;

/**
 * Logging configuration
 */
export const loggingConfig = {
  enableDebug: process.env.NODE_ENV === 'development',
} as const;
