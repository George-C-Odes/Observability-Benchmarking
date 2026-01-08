import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, okJson } from '@/lib/apiResponses';

export async function GET() {
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
      const orchUrl = process.env.ORCH_URL || 'http://orchestrator:3002';
      const orchResponse = await fetch(`${orchUrl}/q/health/ready`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      health.checks.orchestrator = orchResponse.ok ? 'UP' : 'DOWN';
    } catch {
      health.checks.orchestrator = 'DOWN';
    }

    serverLogger.info('[APP-HEALTH API] Health check result:', health);

    return okJson(health);
  } catch (error) {
    serverLogger.error('[APP-HEALTH API] Health check failed:', error);
    return errorFromUnknown(503, error, 'Health check failed');
  }
}
