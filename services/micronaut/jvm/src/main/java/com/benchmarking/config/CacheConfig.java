package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.inject.Singleton;
import java.time.Duration;

/**
 * Configuration class for Caffeine cache.
 * Provides a pre-populated cache for benchmarking purposes.
 */
@Singleton
public class CacheConfig {

    /** Caffeine cache instance for storing key-value pairs. */
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
        
        Runtime runtime = Runtime.getRuntime();
        long maxHeapMB = runtime.maxMemory() / 1024 / 1024;
        long totalHeapMB = runtime.totalMemory() / 1024 / 1024;
        long freeHeapMB = runtime.freeMemory() / 1024 / 1024;
        System.out.println("Init thread: " + Thread.currentThread());
        System.out.println("Heap in MB = Max:" + maxHeapMB + ", Total:" + totalHeapMB 
                + ", Free:" + freeHeapMB);
        System.out.println("Available Processors:" + runtime.availableProcessors());
    }

    /**
     * Returns the configured cache instance.
     *
     * @return the Caffeine cache
     */
    public Cache<String, String> getCache() {
        return cache;
    }
}
