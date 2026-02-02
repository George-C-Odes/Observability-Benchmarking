package io.github.georgecodes.benchmarking.quarkus.application.port;

/**
 * Port for cache access.
 */
public interface CachePort {
    String getIfPresent(String key);
}
