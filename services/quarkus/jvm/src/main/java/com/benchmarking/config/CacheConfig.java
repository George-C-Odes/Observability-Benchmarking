package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.NonNull;

/**
 * Configuration class for Caffeine cache setup.
 * Provides a pre-configured cache instance for application use.
 */
@ApplicationScoped
public class CacheConfig {

    /**
     * Creates and configures a Caffeine cache instance.
     *
     * @return configured Cache instance with max size of 50,000 entries
     */
    @Produces
    @ApplicationScoped
    public Cache<@NonNull String, String> caffeineCache() {
        return Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(1, TimeUnit.DAYS)
            .build();
    }
}
