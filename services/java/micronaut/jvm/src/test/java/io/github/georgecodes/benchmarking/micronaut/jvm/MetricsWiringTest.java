package io.github.georgecodes.benchmarking.micronaut.jvm;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@MicronautTest
class MetricsWiringTest {

    @Inject
    MeterRegistry meterRegistry;

    @Test
    void micronautRegistryIsAlsoInGlobalRegistry() {
        assertNotNull(meterRegistry);
        assertTrue(Metrics.globalRegistry.getRegistries().contains(meterRegistry),
            "Expected Micronaut MeterRegistry to be added to Metrics.globalRegistry");
    }
}