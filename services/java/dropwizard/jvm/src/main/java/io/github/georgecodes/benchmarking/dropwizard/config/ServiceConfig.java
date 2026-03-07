package io.github.georgecodes.benchmarking.dropwizard.config;

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
 */
public record ServiceConfig(
    int port,
    ThreadMode threadMode,
    long cacheSize,
    int jettyMaxThreads,
    int jettyMinThreads,
    int jettyAcceptQueueSize,
    long jettyIdleTimeoutMs
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

    public static ServiceConfig fromEnvironment() {
        int port = parseInt(getEnv("SERVICE_PORT"), 8080);
        ThreadMode mode = ThreadMode.fromEnv(getEnv("THREAD_MODE"));
        long cacheSize = parseLong(getEnv("CACHE_SIZE"), 50000L);

        int maxThreads = parseInt(getEnv("JETTY_MAX_THREADS"), 0);
        int minThreads = parseInt(getEnv("JETTY_MIN_THREADS"), 0);
        int acceptQueueSize = parseInt(getEnv("JETTY_ACCEPT_QUEUE_SIZE"), 10000);
        long idleTimeoutMs = parseLong(getEnv("JETTY_IDLE_TIMEOUT_MS"), 60000L);

        return new ServiceConfig(
            port,
            mode,
            cacheSize,
            maxThreads,
            minThreads,
            acceptQueueSize,
            idleTimeoutMs
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