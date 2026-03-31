package io.github.georgecodes.benchmarking.javalin.infra;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

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
    void bindToGlobalReturnsGlobalRegistry() {
        MeterRegistry registry = MetricsProvider.bindToGlobal();
        assertNotNull(registry);
        assertSame(Metrics.globalRegistry, registry,
            "Expected the global composite registry to be returned");
    }

    @Test
    void bindToGlobalRegistersProcessMetrics() {
        MetricsProvider.bindToGlobal();
        // ProcessThreadMetrics uses ManagementFactory.getThreadMXBean() which works on all
        // platforms, so the process.threads gauge should always be present after binding.
        assertNotNull(testRegistry.find("process.threads").gauge(),
            "process.threads gauge should be registered by ProcessThreadMetrics");
    }

    @Test
    void bindToGlobalIsIdempotent() {
        MeterRegistry first = MetricsProvider.bindToGlobal();
        MeterRegistry second = MetricsProvider.bindToGlobal();
        assertSame(first, second, "Repeated calls should return the same global registry");
    }
}