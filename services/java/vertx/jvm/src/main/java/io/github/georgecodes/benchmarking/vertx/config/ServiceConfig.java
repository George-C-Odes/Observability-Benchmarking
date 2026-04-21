package io.github.georgecodes.benchmarking.vertx.config;

import java.util.Objects;
import java.util.function.Function;

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

    /** Default HTTP port when SERVICE_PORT is unset or blank. */
    private static final int DEFAULT_PORT = 8080;

    /** Default maximum in-memory cache size when CACHE_SIZE is unset or blank. */
    private static final long DEFAULT_CACHE_SIZE = 50000L;

    /** Default event-loop size sentinel meaning "derive from available processors". */
    private static final int DEFAULT_EVENT_LOOP_SIZE = 0;

    public static ServiceConfig fromEnvironment() {
        return fromEnvironment(ServiceConfig::getEnv);
    }

    static ServiceConfig fromEnvironment(Function<String, String> environmentProvider) {
        Objects.requireNonNull(environmentProvider, "environmentProvider");

        int port = parseInt(environmentProvider.apply("SERVICE_PORT"), DEFAULT_PORT);
        long cacheSize = parseCacheSize(environmentProvider.apply("CACHE_SIZE"));
        int eventLoopSize = parseInt(environmentProvider.apply("VERTX_EVENT_LOOP_SIZE"), DEFAULT_EVENT_LOOP_SIZE);

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

    private static long parseCacheSize(String value) {
        if (value == null || value.isBlank()) {
            return DEFAULT_CACHE_SIZE;
        }
        return Long.parseLong(value.trim());
    }
}