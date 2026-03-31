package io.github.georgecodes.benchmarking.javalin.domain;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.javalin.infra.CacheProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link HelloService}.
 */
class HelloServiceTest {

    private HelloService helloService;

    @BeforeEach
    void setUp() {
        Cache<String, String> cache = CacheProvider.create(10);
        helloService = new HelloService(cache);
    }

    @Test
    void handleReturnsPrefixPlusCachedValue() throws InterruptedException {
        String result = helloService.handle("Hello from Javalin platform REST ", 0);
        assertNotNull(result);
        assertEquals("Hello from Javalin platform REST value-1", result);
    }

    @Test
    void handleWithDifferentPrefix() throws InterruptedException {
        String result = helloService.handle("Hello from Javalin virtual REST ", 0);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Javalin virtual REST "),
            "Expected virtual prefix, got: " + result);
    }

    @Test
    void handleWithEmptyCacheReturnsNullSuffix() throws InterruptedException {
        Cache<String, String> emptyCache = CacheProvider.create(0);
        HelloService emptyService = new HelloService(emptyCache);

        String result = emptyService.handle("prefix ", 0);
        assertNotNull(result);
        assertEquals("prefix null", result);
    }

    @Test
    void handleWithSleepDelays() throws InterruptedException {
        long start = System.nanoTime();
        String result = helloService.handle("Hello from Javalin platform REST ", 1);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        assertNotNull(result);
        assertEquals("Hello from Javalin platform REST value-1", result);
        assertTrue(elapsedMs >= 900, "Expected at least ~1s delay, got " + elapsedMs + "ms");
    }
}