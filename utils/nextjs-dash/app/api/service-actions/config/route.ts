import { okJson } from '@/lib/apiResponses';
import { withApiRoute } from '@/lib/routeWrapper';
import { DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG, type ServiceActionsRuntimeConfig } from '@/lib/runtimeConfigTypes';
import { isServiceActionsEnabled } from '@/lib/serviceActionFlags';

const SERVICES = [
  // OBS
  'alloy',
  'grafana',
  'loki',
  'mimir',
  'pyroscope',
  'tempo',

  // SERVICES
  'spring-jvm-tomcat-platform',
  'spring-jvm-tomcat-virtual',
  'spring-jvm-netty',
  'spring-native-tomcat-platform',
  'spring-native-tomcat-virtual',
  'spring-native-netty',
  'quarkus-jvm',
  'quarkus-native',
  'spark-jvm-platform',
  'spark-jvm-virtual',
  'javalin-jvm-platform',
  'javalin-jvm-virtual',
  'micronaut-jvm',
  'micronaut-native',
  'helidon-se-jvm',
  'helidon-se-native',
  'helidon-mp-jvm',
  'helidon-mp-native',
  'go',

  // UTILS
  'nextjs-dash',
  'orchestrator',
  'wrk2',
] as const;

/**
 * GET /api/service-actions/config
 * Runtime service-action feature flags. Polled by the client.
 */
export const GET = withApiRoute({ name: 'SERVICE_ACTIONS_CONFIG_API' }, async function GET() {
  const enabled: Record<string, boolean> = { ...DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG.enabled };

  for (const s of SERVICES) {
    enabled[s] = isServiceActionsEnabled(s);
  }

  const payload: ServiceActionsRuntimeConfig = { enabled };

  return okJson(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});
