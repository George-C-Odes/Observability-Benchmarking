package io.github.georgecodes.benchmarking.quarkus.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.georgecodes.benchmarking.quarkus.application.port.CachePort;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jspecify.annotations.NonNull;

import java.time.Duration;

/**
 * Infrastructure adapter for a simple in-memory cache.
 */
@ApplicationScoped
public class CaffeineCacheAdapter implements CachePort {

    /**
     * Underlying cache implementation.
     */
    private Cache<@NonNull String, String> cache;

    /**
     * Maximum number of entries to keep in the cache.
     */
    @ConfigProperty(name = "CACHE_SIZE", defaultValue = "50000")
    long cacheSize;

    @PostConstruct
    void init() {
        cache = Caffeine.newBuilder()
            .maximumSize(cacheSize)
            .expireAfterWrite(Duration.ofDays(1))
            .build();
        // Pre-populate cache with some entries.
        for (long i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
    }

    @Override
    public String getIfPresent(String key) {
        return cache.getIfPresent(key);
    }
}