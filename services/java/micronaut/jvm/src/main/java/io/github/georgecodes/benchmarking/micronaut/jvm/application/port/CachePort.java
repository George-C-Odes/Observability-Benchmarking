package io.github.georgecodes.benchmarking.micronaut.jvm.application.port;

import org.jspecify.annotations.Nullable;

public interface CachePort {

    @Nullable
    String getIfPresent(String key);
}