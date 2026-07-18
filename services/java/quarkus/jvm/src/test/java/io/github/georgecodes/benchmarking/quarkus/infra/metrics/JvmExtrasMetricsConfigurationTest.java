package io.github.georgecodes.benchmarking.quarkus.infra.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class JvmExtrasMetricsConfigurationTest {

    @Test
    void processThreadMetricsRegistersProcessThreadsGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        JvmExtrasMetricsConfiguration configuration = new JvmExtrasMetricsConfiguration();

        configuration.processThreadMetrics().bindTo(registry);

        assertNotNull(registry.find("process.threads").gauge(),
            "process.threads gauge should be registered by ProcessThreadMetrics or the JVM fallback");
    }
}