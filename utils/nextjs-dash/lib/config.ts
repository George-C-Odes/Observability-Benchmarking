import { envString } from '@/lib/env';

/**
 * Centralized configuration for the Next.js dashboard application.
 * All environment variables and constants are managed here.
 */

/**
 * Orchestrator service configuration
 */
export const orchestratorConfig = {
  url: envString('ORCH_URL', 'http://localhost:3002'),
  apiKey: envString('ORCH_API_KEY', 'change-me'),
  timeout: 60000, // 60 seconds
} as const;

// Script runner config is runtime (see /api/script-runner/config). Keeping server-side config here
// risks drifting defaults and confusing operators.

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
