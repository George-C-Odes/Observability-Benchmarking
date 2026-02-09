package io.github.georgecodes.benchmarking.javalin.jvm.config;

import java.util.Locale;

/**
 * Centralized service configuration (env-driven).
 *
 * @param port listening port
 * @param threadMode platform vs virtual thread mode
 * @param cacheSize max entries for the in-memory cache
 * @param jettyMaxThreads Jetty max threads (0 means use framework default)
 * @param jettyMinThreads Jetty min threads (0 means use framework default)
 * @param jettyAcceptQueueSize Jetty accept queue size
 * @param jettyIdleTimeoutMs Jetty idle timeout in milliseconds
 * @param handlerExecutionMode whether handlers run direct or are offloaded
 * @param platformExecutorThreads platform executor size when offloading (0 means computed)
 */
public record ServiceConfig(
    int port,
    ThreadMode threadMode,
    long cacheSize,
    int jettyMaxThreads,
    int jettyMinThreads,
    int jettyAcceptQueueSize,
    long jettyIdleTimeoutMs,
    HandlerExecutionMode handlerExecutionMode,
    int platformExecutorThreads
) {

    public enum ThreadMode {
        /** Use platform (OS) threads. */
        PLATFORM,
        /** Use Java virtual threads (Project Loom). */
        VIRTUAL;

        public static ThreadMode fromEnv(String value) {
            if (value == null || value.isBlank()) {
                return PLATFORM;
            }
            String v = value.trim().toLowerCase(Locale.ROOT);
            return switch (v) {
                case "virtual", "vthread", "vthreads", "vt" -> VIRTUAL;
                case "platform", "thread", "threads", "pt" -> PLATFORM;
                default -> throw new IllegalArgumentException("Invalid THREAD_MODE: " + value);
            };
        }
    }

    public enum HandlerExecutionMode {
        /** Run the handler logic directly on the framework request thread. */
        DIRECT,
        /** Offload handler logic onto the configured executor. */
        OFFLOAD;

        public static HandlerExecutionMode fromEnv(String value) {
            if (value == null || value.isBlank()) {
                return DIRECT;
            }
            String v = value.trim().toLowerCase(Locale.ROOT);
            return switch (v) {
                case "direct" -> DIRECT;
                case "offload", "executor" -> OFFLOAD;
                default -> throw new IllegalArgumentException(
                    "Invalid JAVALIN_HANDLER_EXECUTION_MODE: " + value);
            };
        }
    }

    public static ServiceConfig fromEnvironment() {
        int port = parseInt(getEnv("SERVICE_PORT"), 8080);
        ThreadMode mode = ThreadMode.fromEnv(getEnv("THREAD_MODE"));
        long cacheSize = parseLong(getEnv("CACHE_SIZE"), 50000L);

        int maxThreads = parseInt(getEnv("JETTY_MAX_THREADS"), 0);
        int minThreads = parseInt(getEnv("JETTY_MIN_THREADS"), 0);
        int acceptQueueSize = parseInt(getEnv("JETTY_ACCEPT_QUEUE_SIZE"), 10000);
        long idleTimeoutMs = parseLong(getEnv("JETTY_IDLE_TIMEOUT_MS"), 60000L);

        HandlerExecutionMode handlerExecutionMode = HandlerExecutionMode.fromEnv(
            getEnv("JAVALIN_HANDLER_EXECUTION_MODE"));
        int platformExecutorThreads = parseInt(getEnv("JAVALIN_PLATFORM_EXECUTOR_THREADS"), 0);

        return new ServiceConfig(
            port,
            mode,
            cacheSize,
            maxThreads,
            minThreads,
            acceptQueueSize,
            idleTimeoutMs,
            handlerExecutionMode,
            platformExecutorThreads
        );
    }

    private static String getEnv(String key) {
        return System.getenv(key);
    }

    private static int parseInt(String value, int defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return Integer.parseInt(value.trim());
    }

    private static long parseLong(String value, long defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return Long.parseLong(value.trim());
    }
}
