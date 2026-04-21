package io.github.georgecodes.benchmarking.helidon.se.infra.cache;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CaffeineCacheAdapterTest {

    @Test
    void invalidConfiguredCacheSizeFallsBackToDefault() {
        CaffeineCacheAdapter adapter = new CaffeineCacheAdapter(0);

        assertEquals("value-1", adapter.getIfPresent("1"));
        assertEquals("value-50000", adapter.getIfPresent("50000"));
        assertNull(adapter.getIfPresent("50001"));
    }

    @Test
    void clampCacheSizeCapsOversizedValues() throws Exception {
        assertEquals(50_000, invokeClampCacheSize(0));
        assertEquals(5_000_000, invokeClampCacheSize(5_000_001));
    }

    private static int invokeClampCacheSize(int value) throws Exception {
        Method method = CaffeineCacheAdapter.class.getDeclaredMethod("clampCacheSize", int.class);
        method.setAccessible(true);
        return (int) method.invoke(null, value);
    }
}
