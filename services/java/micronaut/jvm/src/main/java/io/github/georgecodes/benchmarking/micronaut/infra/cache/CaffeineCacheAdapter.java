package io.github.georgecodes.benchmarking.micronaut.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.georgecodes.benchmarking.micronaut.application.port.CachePort;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Value;
import jakarta.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.time.Duration;

@Singleton
@Slf4j
public final class CaffeineCacheAdapter implements CachePort {

    /** Underlying Caffeine cache instance. */
    private final Cache<@NonNull String, String> cache;

    public CaffeineCacheAdapter(Cache<String, String> cache) {
        this.cache = cache;
    }

    @Override
    public @Nullable String getIfPresent(String key) {
        return cache.getIfPresent(key);
    }

    @Factory
    static class CacheFactory {

        /** Default cache size used when configuration is missing or invalid. */
        private static final int DEFAULT_CACHE_SIZE = 50_000;

        /** Minimum allowed cache size. Values below this are treated as invalid. */
        private static final int MIN_CACHE_SIZE = 1;

        /** Maximum allowed cache size to avoid runaway memory usage. */
        private static final int MAX_CACHE_SIZE = 5_000_000;

        @Singleton
        Cache<String, String> helloCache(
            @Value("${benchmark.cache.size:" + DEFAULT_CACHE_SIZE + "}") int configuredCacheSize
        ) {
            int cacheSize = clampCacheSize(configuredCacheSize);
            log.info("CACHE_SIZE: {}", cacheSize);
            Cache<@NonNull String, String> cache = Caffeine.newBuilder()
                .maximumSize(cacheSize)
                .expireAfterWrite(Duration.ofDays(1))
                .build();
            for (int i = cacheSize; i > 0; i--) {
                cache.put(String.valueOf(i), "value-" + i);
            }
            return cache;
        }

        private static int clampCacheSize(int value) {
            if (value < MIN_CACHE_SIZE) {
                return DEFAULT_CACHE_SIZE;
            }
            return Math.min(value, MAX_CACHE_SIZE);
        }
    }
}