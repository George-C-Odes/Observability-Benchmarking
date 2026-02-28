package io.github.georgecodes.benchmarking.helidon.se.application.port;

import org.jspecify.annotations.Nullable;

public interface CachePort {

    @Nullable
    String getIfPresent(String key);
}