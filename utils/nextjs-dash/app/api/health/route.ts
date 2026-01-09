import { orchestratorConfig } from '@/lib/config';
import { errorFromUnknown } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { serverLogger } from '@/lib/serverLogger';

export const GET = withApiRoute({ name: 'HEALTH_API' }, async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const service = url.searchParams.get('service');

    const upstream = `${orchestratorConfig.url}/v1/health${service ? `?service=${encodeURIComponent(service)}` : ''}`;
    serverLogger.info('Checking health of service:', service ? service : 'ALL');
    const response = await fetch(upstream);
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (error) {
    serverLogger.error('Error checking service health:', error);
    return errorFromUnknown(500, error, 'Failed to fetch service health');
  }
});