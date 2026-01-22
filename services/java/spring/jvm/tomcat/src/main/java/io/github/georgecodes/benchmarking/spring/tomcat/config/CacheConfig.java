package io.github.georgecodes.benchmarking.spring.tomcat.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.jspecify.annotations.NonNull;

import java.time.Duration;

/**
 * Configuration class for Caffeine cache setup in Spring.
 * Provides a pre-configured cache bean for application use.
 */
@Slf4j
@Configuration
public class CacheConfig {
    /**
     * Maximum number of entries the cache can hold.
     * Defaults to 50,000 entries if not configured.
     */
    @Value("${CACHE_SIZE:50000}")
    private long cacheSize;
    /**
     * Creates and configures a Caffeine cache bean.
     *
     * @return configured Cache instance with max size of 50,000 entries
     */
    @Bean
    public Cache<@NonNull String, String> caffeineCache() {
        Cache<@NonNull String, String> cache = Caffeine.newBuilder()
            .maximumSize(cacheSize)
            .expireAfterWrite(Duration.ofDays(1))
            .build();
        // Pre-populate cache with some entries for testing
        for (long i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }
        log.info("Cache Size :{}", cache.asMap().size());
        return cache;
    }
}
