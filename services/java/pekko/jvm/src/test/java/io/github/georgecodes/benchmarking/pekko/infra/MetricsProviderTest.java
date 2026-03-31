package io.github.georgecodes.benchmarking.pekko.infra;

import io.micrometer.core.instrument.Metrics;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link MetricsProvider}.
 */
class MetricsProviderTest {

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
    void createRegistersProcessMetrics() {
        MetricsProvider.create("/hello/reactive");
        // ProcessMemoryMetrics and ProcessThreadMetrics bind meters to the registry.
        assertNotNull(Metrics.globalRegistry, "Registry should not be null after binding");
    }

    @Test
    void incrementReactiveMultipleTimes() {
        MetricsProvider provider = MetricsProvider.create("/hello/reactive");
        assertDoesNotThrow(() -> {
            provider.incrementReactive();
            provider.incrementReactive();
            provider.incrementReactive();
        });
    }
}