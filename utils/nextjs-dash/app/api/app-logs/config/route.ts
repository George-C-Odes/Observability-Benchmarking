import { okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { envNumber } from '@/lib/env';
import { DEFAULT_APP_LOGS_RUNTIME_CONFIG, type AppLogsRuntimeConfig } from '@/lib/runtimeConfigTypes';

export const GET = withApiRoute({ name: 'APP_LOGS_CONFIG_API' }, async function GET() {
  const payload: AppLogsRuntimeConfig = {
    clientMaxEntries: envNumber('APP_LOGS_CLIENT_MAX_ENTRIES', DEFAULT_APP_LOGS_RUNTIME_CONFIG.clientMaxEntries),
    serverMaxEntries: envNumber('APP_LOGS_SERVER_MAX_ENTRIES', DEFAULT_APP_LOGS_RUNTIME_CONFIG.serverMaxEntries),
  };

  return okJson(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
