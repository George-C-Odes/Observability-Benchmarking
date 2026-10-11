package io.github.georgecodes.benchmarking.helidon.mp.infra;

import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.GlobalOpenTelemetry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StartupListenerTest {

    @BeforeEach
    @AfterEach
    void cleanUp() throws Exception {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
        new ArrayList<>(Metrics.globalRegistry.getRegistries()).forEach(Metrics.globalRegistry::remove);
        bridgedFlag().set(false);
    }

    @Test
    void onStartupWarmsKnownEndpointMetrics() {
        StartupListener listener = new StartupListener(
                GlobalOpenTelemetry.get(),
                new MicrometerMetricsAdapter());

        listener.onStartup(new Object());

        Counter counter = Metrics.globalRegistry.find("hello.request.count")
                .tag("endpoint", HelloMode.VIRTUAL.endpointTag())
                .counter();
        assertNotNull(counter);
    }

    @Test
    void onStartupBridgesMicrometerRegistry() {
        StartupListener listener = new StartupListener(
                GlobalOpenTelemetry.get(),
                new MicrometerMetricsAdapter());

        listener.onStartup(new Object());

        assertTrue(Metrics.globalRegistry.getRegistries().stream()
                .map(MeterRegistry::getClass)
                .map(Class::getName)
                .anyMatch(name -> name.contains("OpenTelemetryMeterRegistry")));
    }

    private static AtomicBoolean bridgedFlag() throws Exception {
        Field field = StartupListener.class.getDeclaredField("MICROMETER_BRIDGED");
        field.setAccessible(true);
        return (AtomicBoolean) field.get(null);
    }
}
