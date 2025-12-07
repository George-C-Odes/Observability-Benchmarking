package com.benchmarking.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.jspecify.annotations.NonNull;

import java.time.Duration;

@Configuration
public class CacheConfig {
    @Bean
    public Cache<@NonNull String, String> caffeineCache() {
        return Caffeine.newBuilder()
                .maximumSize(50_000)
                .expireAfterWrite(Duration.ofDays(1))
                .build();
    }
}
