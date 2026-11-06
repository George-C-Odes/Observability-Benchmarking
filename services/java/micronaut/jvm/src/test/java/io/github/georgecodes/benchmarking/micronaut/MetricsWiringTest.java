package io.github.georgecodes.benchmarking.micronaut;

import io.github.georgecodes.benchmarking.micronaut.application.port.MetricsPort;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.composite.CompositeMeterRegistry;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@MicronautTest
class MetricsWiringTest {

    @Inject
    MeterRegistry meterRegistry;

    @Inject
    MetricsPort metricsPort;

    @Test
    void applicationMetricsReachOpenTelemetryRegistry() {
        // Micronaut Micrometer 6 no longer adds the application registry to Metrics.globalRegistry.
        // Verify the injected registry's export path used by the application instead.
        var composite = assertInstanceOf(CompositeMeterRegistry.class, meterRegistry);
        var otelMeterRegistry = composite.getRegistries().stream()
            .filter(OpenTelemetryMeterRegistry.class::isInstance)
            .findFirst()
            .orElseThrow(() -> new AssertionError(
                "Expected the OpenTelemetry bridge to be a child of the application registry"));

        String endpoint = "metrics-wiring-test";
        metricsPort.incrementHelloRequest(endpoint);

        assertNotNull(meterRegistry.find("hello.request.count").tag("endpoint", endpoint).counter(),
            "Hello request counter should be registered in the application registry");
        assertNotNull(otelMeterRegistry.find("hello.request.count").tag("endpoint", endpoint).counter(),
            "Hello request counter should reach the OpenTelemetry bridge");
    }

    @Test
    void processThreadsGaugeIsRegistered() {
        assertNotNull(meterRegistry.find("process.threads").gauge(),
            "process.threads gauge should be registered by ProcessThreadMetrics or the JVM fallback");
    }
}
