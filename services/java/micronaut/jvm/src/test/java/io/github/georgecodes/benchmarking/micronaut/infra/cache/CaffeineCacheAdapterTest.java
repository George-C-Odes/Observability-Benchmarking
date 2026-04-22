package io.github.georgecodes.benchmarking.micronaut.infra.cache;

import com.github.benmanes.caffeine.cache.Cache;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CaffeineCacheAdapterTest {

    @Test
    void helloCacheFallsBackToDefaultSizeWhenConfiguredSizeIsInvalid() {
        Cache<String, String> cache = new CaffeineCacheAdapter.CacheFactory().helloCache(0);
        CaffeineCacheAdapter adapter = new CaffeineCacheAdapter(cache);

        assertEquals("value-1", adapter.getIfPresent("1"));
        assertEquals("value-50000", adapter.getIfPresent("50000"));
        assertNull(adapter.getIfPresent("50001"));
    }
}

