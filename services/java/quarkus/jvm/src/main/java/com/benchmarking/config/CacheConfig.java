package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.util.concurrent.TimeUnit;

import lombok.extern.jbosslog.JBossLog;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jspecify.annotations.NonNull;

/**
 * Configuration class for Caffeine cache setup.
 * Provides a pre-configured cache instance for application use.
 */
@JBossLog
@ApplicationScoped
public class CacheConfig {
    /**
     * Maximum number of entries the cache can hold.
     * Defaults to 50,000 entries if not configured.
     */
    @ConfigProperty(name = "CACHE_SIZE", defaultValue = "50000")
    long cacheSize;
    /**
     * Creates and configures a Caffeine cache instance.
     *
     * @return configured Cache instance with max size of 50,000 entries
     */
    @Produces
    @ApplicationScoped
    public Cache<@NonNull String, String> caffeineCache() {
        Cache<@NonNull String, String> cache = Caffeine.newBuilder()
            .maximumSize(cacheSize)
            .expireAfterWrite(1, TimeUnit.DAYS)
            .build();
        // Pre-populate cache with some entries for testing
        for (long i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        log.infov("Cache Size :{0}", cache.asMap().size());
        return cache;
    }
}