package io.github.georgecodes.benchmarking.vertx.infra;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link MetricsProvider}.
 */
class MetricsProviderTest {

    private SimpleMeterRegistry testRegistry;

    @BeforeEach
    void setUp() {
        testRegistry = new SimpleMeterRegistry();
        Metrics.globalRegistry.add(testRegistry);
    }

    @AfterEach
    void tearDown() {
        Metrics.globalRegistry.remove(testRegistry);
        testRegistry.close();
    }

    @Test
    void createReturnsNonNull() {
        MetricsProvider provider = MetricsProvider.create("/hello/reactive");
        assertNotNull(provider);
    }

    @Test
    void incrementReactiveDoesNotThrow() {
        MetricsProvider provider = MetricsProvider.create("/hello/reactive");
        assertDoesNotThrow(provider::incrementReactive);
    }

    @Test
    void createRegistersHelloRequestCounter() {
        MetricsProvider.create("/hello/reactive");
        Counter counter = testRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/reactive")
                .counter();
        assertNotNull(counter, "hello.request.count counter should be registered with endpoint tag");
    }

    @Test
    void incrementReactiveIncreasesCounter() {
        MetricsProvider provider = MetricsProvider.create("/hello/reactive");
        Counter counter = testRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/reactive")
                .counter();
        assertNotNull(counter, "counter should exist before incrementing");

        provider.incrementReactive();
        provider.incrementReactive();
        provider.incrementReactive();

        assertEquals(3.0, counter.count(), "counter should reflect 3 increments");
    }
}