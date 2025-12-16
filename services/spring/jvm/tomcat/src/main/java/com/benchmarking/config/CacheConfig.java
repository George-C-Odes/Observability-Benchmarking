package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.jspecify.annotations.NonNull;

import java.time.Duration;

/**
 * Configuration class for Caffeine cache setup in Spring.
 * Provides a pre-configured cache bean for application use.
 */
@Configuration
public class CacheConfig {

    /**
     * Creates and configures a Caffeine cache bean.
     *
     * @return configured Cache instance with max size of 50,000 entries
     */
    @Bean
    public Cache<@NonNull String, String> caffeineCache() {
        return Caffeine.newBuilder()
                .maximumSize(50_000)
                .expireAfterWrite(Duration.ofDays(1))
                .build();
    }
}
