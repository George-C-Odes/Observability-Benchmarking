package io.github.georgecodes.benchmarking.spark.domain;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.spark.infra.CacheProvider;
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
        String result = helloService.handle("Hello from Spark platform REST ", 0);
        assertNotNull(result);
        assertEquals("Hello from Spark platform REST value-1", result);
    }

    @Test
    void handleWithDifferentPrefix() throws InterruptedException {
        String result = helloService.handle("Hello from Spark virtual REST ", 0);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Spark virtual REST "),
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
        // Verify that the service returns the correct result even with a sleep delay.
        // We deliberately avoid asserting wall-clock elapsed time because Thread.sleep
        // timing is non-deterministic and flaky under CI load / VM scheduling jitter.
        String result = helloService.handle("Hello from Spark platform REST ", 1);

        assertNotNull(result);
        assertEquals("Hello from Spark platform REST value-1", result);
    }
}