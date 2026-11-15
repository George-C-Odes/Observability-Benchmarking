package io.github.georgecodes.benchmarking.pekko.config;

import java.util.Objects;
import java.util.function.Function;

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
        return fromEnvironment(ServiceConfig::getEnv);
    }

    static ServiceConfig fromEnvironment(Function<String, String> environmentProvider) {
        Objects.requireNonNull(environmentProvider, "environmentProvider");
        int port = parseInt(environmentProvider.apply("SERVICE_PORT"), 8080);
        long cacheSize = parseLong(environmentProvider.apply("CACHE_SIZE"), 50000L);
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
