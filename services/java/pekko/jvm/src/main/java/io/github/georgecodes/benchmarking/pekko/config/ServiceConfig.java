package io.github.georgecodes.benchmarking.pekko.config;

/**
 * Centralized service configuration (env-driven).
 *
 * @param port      listening port
 * @param cacheSize max entries for the in-memory cache
 */
public record ServiceConfig(
    int port,
    long cacheSize
) {

    /** Creates a {@link ServiceConfig} from environment variables. */
    public static ServiceConfig fromEnvironment() {
        int port = parseInt(getEnv("SERVICE_PORT"), 8080);
        long cacheSize = parseLong(getEnv("CACHE_SIZE"), 50000L);
        return new ServiceConfig(port, cacheSize);
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