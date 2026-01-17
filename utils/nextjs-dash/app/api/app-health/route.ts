import { orchestratorConfig } from '@/lib/config';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, okJson } from '@/lib/apiResponses';

export async function GET() {
  const serverLogger = createScopedServerLogger('APP_HEALTH_API');
  try {
    // Basic health check - if we can execute this, the app is alive
    const health = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      application: 'nextjs-dash',
      version: '1.0.0',
      checks: {
        api: 'UP',
        orchestrator: 'UNKNOWN', // Would need to check orchestrator connectivity
      },
    };

    // Try to check orchestrator connectivity
    try {
      const orchResponse = await fetch(`${orchestratorConfig.url}/q/health/ready`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      health.checks.orchestrator = orchResponse.ok ? 'UP' : 'DOWN';
    } catch {
      health.checks.orchestrator = 'DOWN';
    }

    serverLogger.debug('Health check result', health);

    return okJson(health);
  } catch (error) {
    serverLogger.error('Health check failed', error);
    return errorFromUnknown(503, error, 'Health check failed');
  }
}