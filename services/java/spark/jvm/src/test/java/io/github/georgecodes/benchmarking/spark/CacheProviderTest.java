package io.github.georgecodes.benchmarking.spark;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.spark.infra.CacheProvider;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Unit tests for {@link CacheProvider}.
 */
class CacheProviderTest {

    @Test
    void createPopulatesCache() {
        Cache<String, String> cache = CacheProvider.create(100);
        assertNotNull(cache);
        assertEquals("value-1", cache.getIfPresent("1"));
        assertEquals("value-50", cache.getIfPresent("50"));
        assertEquals("value-100", cache.getIfPresent("100"));
    }

    @Test
    void createWithZeroSizeReturnsEmptyCache() {
        Cache<String, String> cache = CacheProvider.create(0);
        assertNotNull(cache);
        assertNull(cache.getIfPresent("1"));
    }

    @Test
    void createWithSmallSizePopulatesCorrectly() {
        Cache<String, String> cache = CacheProvider.create(5);
        assertNotNull(cache);
        assertEquals("value-1", cache.getIfPresent("1"));
        assertEquals("value-5", cache.getIfPresent("5"));
        assertNull(cache.getIfPresent("6"));
    }
}
