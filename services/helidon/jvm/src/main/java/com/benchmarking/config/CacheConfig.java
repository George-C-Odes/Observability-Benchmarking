package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;

/**
 * Configuration class for Caffeine cache.
 * Provides a pre-populated cache for benchmarking purposes.
 */
public class CacheConfig {

    private final Cache<String, String> cache;

    /**
     * Constructs the CacheConfig and initializes the cache.
     */
    public CacheConfig() {
        this.cache = Caffeine.newBuilder()
                .maximumSize(50_000)
                .expireAfterWrite(Duration.ofDays(1))
                .build();

        // Pre-populate cache with 50,000 entries
        for (int i = 1; i <= 50_000; i++) {
            this.cache.put(String.valueOf(i), "value-" + i);
        }

        System.out.println("Cache initialized with 50,000 entries");
    }

    /**
     * Returns the configured cache instance.
     *
     * @return the Caffeine cache
     */
    public Cache<String, String> cache() {
        return cache;
    }
}
