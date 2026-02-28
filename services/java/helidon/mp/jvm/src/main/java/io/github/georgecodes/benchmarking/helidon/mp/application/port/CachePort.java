package io.github.georgecodes.benchmarking.helidon.mp.application.port;

import org.jspecify.annotations.Nullable;

/**
 * Cache access abstraction.
 */
public interface CachePort {

    @Nullable
    String getIfPresent(String key);
}