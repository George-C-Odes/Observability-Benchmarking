package io.github.georgecodes.benchmarking.helidon.se.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.georgecodes.benchmarking.helidon.se.application.port.CachePort;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.time.Duration;

@Slf4j
public final class CaffeineCacheAdapter implements CachePort {

    /** Default cache size used when configuration is missing or invalid. */
    private static final int DEFAULT_CACHE_SIZE = 50_000;
    /** Minimum allowed cache size. */
    private static final int MIN_CACHE_SIZE = 1;
    /** Maximum allowed cache size to avoid runaway memory usage. */
    private static final int MAX_CACHE_SIZE = 5_000_000;

    /** Underlying Caffeine cache instance. */
    private final Cache<@NonNull String, String> cache;

    public CaffeineCacheAdapter(int configuredCacheSize) {
        int cacheSize = clampCacheSize(configuredCacheSize);
        log.info("CACHE_SIZE: {}", cacheSize);
        this.cache = Caffeine.newBuilder()
                .maximumSize(cacheSize)
                .expireAfterWrite(Duration.ofDays(1))
                .build();
        for (int i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
    }

    @Override
    public @Nullable String getIfPresent(String key) {
        return cache.getIfPresent(key);
    }

    private static int clampCacheSize(int value) {
        if (value < MIN_CACHE_SIZE) {
            return DEFAULT_CACHE_SIZE;
        }
        return Math.min(value, MAX_CACHE_SIZE);
    }
}