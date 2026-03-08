package io.github.georgecodes.benchmarking.vertx;

import com.github.benmanes.caffeine.cache.Cache;
import io.github.georgecodes.benchmarking.vertx.domain.HelloMode;
import io.github.georgecodes.benchmarking.vertx.domain.HelloService;
import io.github.georgecodes.benchmarking.vertx.infra.CacheProvider;
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
    void handleReturnsReactivePrefixPlusCachedValue() {
        String result = helloService.handle(HelloMode.REACTIVE);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Vertx reactive REST "),
            "Expected prefix, got: " + result);
        assertTrue(result.contains("value-1"),
            "Expected cached value 'value-1' in result, got: " + result);
    }

    @Test
    void handleWithEmptyCacheReturnsNullSuffix() {
        Cache<String, String> emptyCache = CacheProvider.create(0);
        HelloService emptyService = new HelloService(emptyCache);

        String result = emptyService.handle(HelloMode.REACTIVE);
        assertNotNull(result);
        assertTrue(result.startsWith("Hello from Vertx reactive REST "),
            "Expected prefix, got: " + result);
    }
}