package io.github.georgecodes.benchmarking.vertx.config;

/**
 * Centralized service configuration (env-driven).
 *
 * @param port          listening port
 * @param cacheSize     max entries for the in-memory cache
 * @param eventLoopSize number of Vert.x event-loop threads (0 means 2 × available processors)
 */
public record ServiceConfig(
    int port,
    long cacheSize,
    int eventLoopSize
) {

    public static ServiceConfig fromEnvironment() {
        int port = parseInt(getEnv("SERVICE_PORT"), 8080);
        long cacheSize = parseLong(getEnv("CACHE_SIZE"), 50000L);
        int eventLoopSize = parseInt(getEnv("VERTX_EVENT_LOOP_SIZE"), 0);

        return new ServiceConfig(port, cacheSize, eventLoopSize);
    }

    /**
     * Resolves the effective event-loop pool size.
     * For a 2-vCPU container Vert.x defaults to 4 (2 × cores), which is a good baseline.
     *
     * @return resolved event-loop size
     */
    public int resolvedEventLoopSize() {
        return eventLoopSize > 0
            ? eventLoopSize
            : Math.max(2, Runtime.getRuntime().availableProcessors() * 2);
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