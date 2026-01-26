package io.github.georgecodes.benchmarking.spark.jvm.infra;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;

/**
 * Provides the pre-populated Caffeine cache used by request handlers.
 */
public final class CacheProvider {

    /** Logger. */
    private static final Logger LOG = LoggerFactory.getLogger(CacheProvider.class);

    private CacheProvider() {
    }

    public static Cache<@NonNull String, String> create(long cacheSize) {
        Cache<@NonNull String, String> cache = Caffeine.newBuilder()
            .maximumSize(cacheSize)
            .expireAfterWrite(1, TimeUnit.DAYS)
            .build();

        for (long i = cacheSize; i > 0; i--) {
            cache.put(String.valueOf(i), "value-" + i);
        }

        LOG.info("Cache size: {}", cache.asMap().size());
        return cache;
    }
}
