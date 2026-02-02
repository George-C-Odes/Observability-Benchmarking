package io.github.georgecodes.benchmarking.spring.tomcat.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.spring.tomcat.application.port.CachePort;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Component;

@Component
public class CaffeineCacheAdapter implements CachePort {

    /** Underlying Caffeine cache instance used for lookups. */
    private final Cache<@NonNull String, String> cache;

    public CaffeineCacheAdapter(Cache<@NonNull String, String> cache) {
        this.cache = cache;
    }

    @Override
    public @NonNull String get(@NonNull String key) {
        String value = cache.getIfPresent(key);
        return value == null ? "" : value;
    }
}