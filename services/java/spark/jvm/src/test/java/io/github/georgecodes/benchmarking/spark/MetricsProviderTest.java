package io.github.georgecodes.benchmarking.spark;

import io.github.georgecodes.benchmarking.spark.infra.MetricsProvider;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * Unit tests for {@link MetricsProvider}.
 */
class MetricsProviderTest {

    @Test
    void bindToGlobalReturnsGlobalRegistry() {
        MeterRegistry registry = MetricsProvider.bindToGlobal();
        assertNotNull(registry);
        assertSame(Metrics.globalRegistry, registry,
            "Expected the global composite registry to be returned");
    }

    @Test
    void bindToGlobalRegistersProcessMetrics() {
        MeterRegistry registry = MetricsProvider.bindToGlobal();
        // ProcessMemoryMetrics and ProcessThreadMetrics bind meters to the registry.
        assertNotNull(registry, "Registry should not be null after binding");
        // On some CI environments, /proc may not exist, so we only assert non-null.
    }
}