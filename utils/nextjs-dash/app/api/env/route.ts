/**
 * Environment file API route.
 * Proxies requests to the Quarkus orchestrator service for .env file operations.
 * Follows Single Responsibility Principle - handles only env file HTTP proxying.
 */

import { NextRequest } from 'next/server';
import { getEnvFile, updateEnvFile } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, okJson, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

export const GET = withApiRoute({ name: 'ENV_API' }, async function GET() {
  try {
    serverLogger.info('Fetching environment file from orchestrator');
    const envData = await getEnvFile();
    return okJson(envData);
  } catch (error) {
    serverLogger.error('Failed to fetch environment file:', error);
    return errorFromUnknown(500, error, 'Failed to fetch environment file');
  }
});

export const POST = withApiRoute({ name: 'ENV_API' }, async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { content?: unknown };
    // Keep minimal sanity check, but let orchestrator enforce rules.
    if (typeof body.content !== 'string') {
      return errorJson(400, { error: 'content must be a string' });
    }

    await updateEnvFile(body.content);
    serverLogger.info('Successfully updated environment file');
    return okJson({ success: true });
  } catch (error) {
    serverLogger.error('Failed to update environment file:', error);
    return errorFromUnknown(500, error, 'Failed to update environment file');
  }
});
