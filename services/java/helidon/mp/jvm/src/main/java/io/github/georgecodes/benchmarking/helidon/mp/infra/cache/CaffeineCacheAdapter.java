package io.github.georgecodes.benchmarking.helidon.mp.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.CachePort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import java.time.Duration;

/**
 * Caffeine-backed {@link CachePort} implementation.
 * Cache size is injected via MicroProfile Config.
 */
@Slf4j
@ApplicationScoped
public class CaffeineCacheAdapter implements CachePort {

    /** Default cache size used when configured value is missing or invalid. */
    private static final int DEFAULT_CACHE_SIZE = 50_000;

    /** Minimum accepted cache size (values below this fall back to {@link #DEFAULT_CACHE_SIZE}). */
    private static final int MIN_CACHE_SIZE = 1;

    /** Maximum accepted cache size to protect host memory during benchmarks. */
    private static final int MAX_CACHE_SIZE = 5_000_000;

    /** Underlying Caffeine cache instance pre-populated with stable keys/values. */
    private final Cache<@NonNull String, String> cache;

    @Inject
    public CaffeineCacheAdapter(
            @ConfigProperty(name = "CACHE_SIZE", defaultValue = "0") int envCacheSize,
            @ConfigProperty(name = "benchmark.cache.size", defaultValue = "50000") int configCacheSize) {
        int rawSize = envCacheSize > 0 ? envCacheSize : configCacheSize;
        this.cache = buildAndPopulate(rawSize);
    }

    /**
     * Test-only constructor (no CDI).
     */
    public CaffeineCacheAdapter(int configuredCacheSize) {
        this.cache = buildAndPopulate(configuredCacheSize);
    }

    @Override
    public @Nullable String getIfPresent(String key) {
        return cache.getIfPresent(key);
    }

    /**
     * Creates a pre-populated Caffeine cache with the given (clamped) size.
     */
    private static Cache<@NonNull String, String> buildAndPopulate(int rawSize) {
        int cacheSize = clampCacheSize(rawSize);
        log.info("CACHE_SIZE: {}", cacheSize);
        Cache<@NonNull String, String> c = Caffeine.newBuilder()
                .maximumSize(cacheSize)
                .expireAfterWrite(Duration.ofDays(1))
                .build();
        for (int i = cacheSize; i > 0; i--) {
            c.put(String.valueOf(i), "value-" + i);
        }
        return c;
    }

    private static int clampCacheSize(int value) {
        if (value < MIN_CACHE_SIZE) {
            return DEFAULT_CACHE_SIZE;
        }
        return Math.min(value, MAX_CACHE_SIZE);
    }
}