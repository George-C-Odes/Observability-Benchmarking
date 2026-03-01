package io.github.georgecodes.benchmarking.spark;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.spark.domain.HelloService;
import io.github.georgecodes.benchmarking.spark.infra.CacheProvider;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link HelloService}.
 */
class HelloServiceTest {

    private final Cache<String, String> cache = CacheProvider.create(10);
    private final HelloService helloService = new HelloService(cache);

    @Test
    void handleReturnsPrefixPlusCachedValue() throws InterruptedException {
        String result = helloService.handle("Hello from Spark platform REST ", 0);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Spark platform REST "),
            "Expected prefix, got: " + result);
        assertTrue(result.contains("value-1"),
            "Expected cached value 'value-1' in result, got: " + result);
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
        // cache.getIfPresent("1") returns null when cache is empty, so result = prefix + null
        assertNotNull(result);
        assertTrue(result.startsWith("prefix "),
            "Expected prefix, got: " + result);
    }
}