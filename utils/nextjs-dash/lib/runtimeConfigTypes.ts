/**
 * Shared runtime-config contracts.
 *
 * These configs are served by API routes (e.g. /api/script-runner/config) and
 * consumed by browser hooks. Keeping the types here avoids drift.
 */

export type ScriptRunnerRuntimeConfig = {
  maxExecutionLogLines: number;
  eventStreamTimeoutMs: number;
  debug: boolean;
};

export const DEFAULT_SCRIPT_RUNNER_RUNTIME_CONFIG: ScriptRunnerRuntimeConfig = {
  maxExecutionLogLines: 500,
  eventStreamTimeoutMs: 30 * 60 * 1000,
  debug: false,
};

export type AppLogsRuntimeConfig = {
  clientMaxEntries: number;
  serverMaxEntries: number;
};

export const DEFAULT_APP_LOGS_RUNTIME_CONFIG: AppLogsRuntimeConfig = {
  clientMaxEntries: 400,
  serverMaxEntries: 500,
};

export type ServiceActionsRuntimeConfig = {
  /** resolved per-service enable flags */
  enabled: Record<string, boolean>;
};

export const DEFAULT_SERVICE_ACTIONS_RUNTIME_CONFIG: ServiceActionsRuntimeConfig = {
  enabled: {
    // OBS
    alloy: true,
    grafana: true,
    loki: true,
    mimir: true,
    pyroscope: true,
    tempo: true,

    // SERVICES
    'spring-jvm-tomcat-platform': false,
    'spring-jvm-tomcat-virtual': false,
    'spring-jvm-netty': false,
    'spring-native-tomcat-platform': false,
    'spring-native-tomcat-virtual': false,
    'spring-native-netty': false,
    'quarkus-jvm': false,
    'quarkus-native': false,
    'spark-jvm-platform': false,
    'spark-jvm-virtual': false,
    'javalin-jvm-platform': false,
    'javalin-jvm-virtual': false,
    'micronaut-jvm': false,
    'micronaut-native': false,
    'go': false,

    // UTILS
    'nextjs-dash': false,
    'orchestrator': false,
    'wrk2': false,
  },
};