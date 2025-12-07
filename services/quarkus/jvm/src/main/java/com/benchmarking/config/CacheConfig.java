package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.NonNull;

@ApplicationScoped
public class CacheConfig {

    @Produces
    @ApplicationScoped
    public Cache<@NonNull String, String> caffeineCache() {
        return Caffeine.newBuilder()
            .maximumSize(50_000)
            .expireAfterWrite(1, TimeUnit.DAYS)
            .build();
    }
}