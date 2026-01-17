/**
 * Environment file API route.
 * Proxies requests to the Quarkus orchestrator service for .env file operations.
 * Follows Single Responsibility Principle - handles only env file HTTP proxying.
 */

import { NextRequest } from 'next/server';
import { getEnvFile, updateEnvFile } from '@/lib/orchestratorClient';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, okJson, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

export const GET = withApiRoute({ name: 'ENV_API' }, async function GET() {
  const serverLogger = createScopedServerLogger('ENV_API');
  try {
    serverLogger.debug('Fetching environment file from orchestrator');
    const envData = await getEnvFile();
    return okJson(envData);
  } catch (error) {
    serverLogger.error('Error fetching environment', error);
    return errorFromUnknown(500, error, 'Failed to fetch env');
  }
});

export const POST = withApiRoute({ name: 'ENV_API' }, async function POST(request: NextRequest) {
  const serverLogger = createScopedServerLogger('ENV_API');
  try {
    const body = (await request.json()) as { content?: unknown };
    // Keep minimal sanity check, but let orchestrator enforce rules.
    if (typeof body.content !== 'string') {
      return errorJson(400, { error: 'content must be a string' });
    }

    await updateEnvFile(body.content);
    serverLogger.debug('Successfully updated environment file');
    return okJson({ success: true });
  } catch (error) {
    serverLogger.error('Error updating env', error);
    return errorFromUnknown(500, error, 'Failed to update env');
  }
});
