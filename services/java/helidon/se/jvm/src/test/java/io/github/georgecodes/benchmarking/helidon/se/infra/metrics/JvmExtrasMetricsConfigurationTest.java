package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class JvmExtrasMetricsConfigurationTest {

    @Test
    void registerCreatesProcessThreadsGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        JvmExtrasMetricsConfiguration configuration = new JvmExtrasMetricsConfiguration(registry);

        configuration.register();

        assertNotNull(registry.find("process.threads").gauge(),
            "process.threads gauge should be registered by ProcessThreadMetrics or the JVM fallback");
    }
}