/**
 * Benchmark targets API route.
 * Proxies requests to the Quarkus orchestrator for benchmark-targets.txt file operations.
 * Follows Single Responsibility Principle — handles only benchmark targets HTTP proxying.
 */

import { NextRequest } from 'next/server';
import { getBenchmarkTargets, updateBenchmarkTargets } from '@/lib/orchestratorClient';
import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, okJson, errorJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';

export const GET = withApiRoute({ name: 'BENCHMARK_TARGETS_API' }, async function GET() {
  const serverLogger = createScopedServerLogger('BENCHMARK_TARGETS_API');
  try {
    serverLogger.debug('Fetching benchmark targets from orchestrator');
    const data = await getBenchmarkTargets();
    return okJson(data);
  } catch (error) {
    serverLogger.error('Error fetching benchmark targets', error);
    return errorFromUnknown(500, error, 'Failed to fetch benchmark targets');
  }
});

export const POST = withApiRoute({ name: 'BENCHMARK_TARGETS_API' }, async function POST(request: NextRequest) {
  const serverLogger = createScopedServerLogger('BENCHMARK_TARGETS_API');
  try {
    const body = (await request.json()) as { urls?: unknown };
    if (!Array.isArray(body.urls)) {
      return errorJson(400, { error: 'urls must be an array of strings' });
    }

    await updateBenchmarkTargets(body.urls as string[]);
    serverLogger.debug('Successfully updated benchmark targets');
    return okJson({ success: true });
  } catch (error) {
    serverLogger.error('Error updating benchmark targets', error);
    return errorFromUnknown(500, error, 'Failed to update benchmark targets');
  }
});