package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class OtelConfigTest {

    @BeforeEach
    void resetGlobalOpenTelemetry() {
        GlobalOpenTelemetry.resetForTest();
    }

    @AfterEach
    void clearAddedRegistries() {
        new ArrayList<>(Metrics.globalRegistry.getRegistries()).forEach(Metrics.globalRegistry::remove);
        GlobalOpenTelemetry.resetForTest();
    }

    @Test
    void initializeCreatesOpenTelemetryAndBridgeRegistersMeterRegistry() {
        List<MeterRegistry> before = new ArrayList<>(Metrics.globalRegistry.getRegistries());

        OpenTelemetry openTelemetry = OtelConfig.initialize();
        OtelConfig.bridgeMicrometer(openTelemetry);

        List<MeterRegistry> after = new ArrayList<>(Metrics.globalRegistry.getRegistries());

        assertNotNull(openTelemetry);
        after.removeAll(before);
        assertFalse(after.isEmpty());
    }
}
