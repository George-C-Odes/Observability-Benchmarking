/**
 * Environment file API route.
 * Proxies requests to the Quarkus orchestrator service for .env file operations.
 * Follows Single Responsibility Principle - handles only env file HTTP proxying.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnvFile, updateEnvFile } from '@/lib/orchestratorClient';

/**
 * GET /api/env
 * Retrieves the content of the environment configuration file.
 *
 * @returns Environment file content from orchestrator
 */
export async function GET() {
  try {
    console.log('[API_ENV] Fetching environment file from orchestrator');
    const envData = await getEnvFile();
    console.log('[API_ENV] Successfully retrieved environment file');
    return NextResponse.json(envData);
  } catch (error) {
    console.error('[API_ENV] Failed to fetch environment file:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch environment file';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
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
    console.log('[API_ENV] Updating environment file');
    const body = await request.json();
    
    if (!body.content || typeof body.content !== 'string') {
      console.error('[API_ENV] Invalid request: content field is required');
      return NextResponse.json(
        { error: 'content field is required and must be a string' },
        { status: 400 }
      );
    }

    await updateEnvFile(body.content);
    console.log('[API_ENV] Successfully updated environment file');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API_ENV] Failed to update environment file:', error);
    const message = error instanceof Error ? error.message : 'Failed to update environment file';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
