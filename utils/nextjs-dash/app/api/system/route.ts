import { createScopedServerLogger } from '@/lib/scopedServerLogger';
import { errorFromUnknown, okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { collectServerSystemInfo } from '@/lib/serverSystemInfo';

export const GET = withApiRoute({ name: 'SYSTEM_API' }, async function GET() {
  const serverLogger = createScopedServerLogger('SYSTEM_API');
  try {
    const systemInfo = collectServerSystemInfo();

    serverLogger.debug('System info', systemInfo);

    return okJson(systemInfo);
  } catch (error) {
    serverLogger.error('Error getting system info', error);
    return errorFromUnknown(500, error, 'Failed to get system info');
  }
});
