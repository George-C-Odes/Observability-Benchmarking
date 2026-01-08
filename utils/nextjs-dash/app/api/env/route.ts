/**
 * Environment file API route.
 * Proxies requests to the Quarkus orchestrator service for .env file operations.
 * Follows Single Responsibility Principle - handles only env file HTTP proxying.
 */

import { NextRequest } from 'next/server';
import { getEnvFile, updateEnvFile } from '@/lib/orchestratorClient';
import { serverLogger } from '@/lib/serverLogger';
import { errorFromUnknown, errorJson, okJson } from '@/lib/apiResponses';

/**
 * GET /api/env
 * Retrieves the content of the environment configuration file.
 *
 * @returns Environment file content from orchestrator
 */
export async function GET() {
  try {
    serverLogger.info('[API_ENV] Fetching environment file from orchestrator');
    const envData = await getEnvFile();
    serverLogger.info('[API_ENV] Successfully retrieved environment file');
    return okJson(envData);
  } catch (error) {
    serverLogger.error('[API_ENV] Failed to fetch environment file:', error);
    return errorFromUnknown(500, error, 'Failed to fetch environment file');
  }
}

/**
 * POST /api/env
 * Updates the environment configuration file.
 *
 * @param request - Request containing the new environment file content
 * @returns Success response or error
 */
export async function POST(request: NextRequest) {
  try {
    serverLogger.info('[API_ENV] Updating environment file');
    const body = (await request.json()) as { content?: unknown };

    if (typeof body.content !== 'string' || !body.content.trim()) {
      serverLogger.warn('[API_ENV] Invalid request: content field is required');
      return errorJson(400, { error: 'content field is required and must be a non-empty string' });
    }

    await updateEnvFile(body.content);
    serverLogger.info('[API_ENV] Successfully updated environment file');
    return okJson({ success: true });
  } catch (error) {
    serverLogger.error('[API_ENV] Failed to update environment file:', error);
    return errorFromUnknown(500, error, 'Failed to update environment file');
  }
}
