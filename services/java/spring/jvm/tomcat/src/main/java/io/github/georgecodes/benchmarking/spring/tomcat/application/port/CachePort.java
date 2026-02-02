package io.github.georgecodes.benchmarking.spring.tomcat.application.port;

import org.jspecify.annotations.NonNull;

public interface CachePort {
    @NonNull String get(@NonNull String key);
}