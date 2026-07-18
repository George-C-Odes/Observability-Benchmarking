package io.github.georgecodes.benchmarking.spring.netty.infra;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class ModuleConfigTest {

    @Test
    void processThreadMetricsRegistersProcessThreadsGauge() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ModuleConfig moduleConfig = new ModuleConfig();

        moduleConfig.processThreadMetrics().bindTo(registry);

        assertNotNull(registry.find("process.threads").gauge(),
            "process.threads gauge should be registered by ProcessThreadMetrics or the JVM fallback");
    }
}

