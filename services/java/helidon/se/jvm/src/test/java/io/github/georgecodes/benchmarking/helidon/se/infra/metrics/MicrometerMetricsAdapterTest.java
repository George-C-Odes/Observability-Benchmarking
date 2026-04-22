package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;

class MicrometerMetricsAdapterTest {

    @BeforeEach
    @AfterEach
    void clearMeters() {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
    }

    @Test
    void warmUpPreRegistersCounterAndIncrementUsesIt() {
        MicrometerMetricsAdapter adapter = new MicrometerMetricsAdapter();

        adapter.warmUp("/hello/virtual");
        adapter.incrementHelloRequest("/hello/virtual");
        adapter.incrementHelloRequest("/hello/lazy");

        Counter warmedCounter = Metrics.globalRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/virtual")
                .counter();
        Counter lazyCounter = Metrics.globalRegistry.find("hello.request.count")
                .tag("endpoint", "/hello/lazy")
                .counter();

        assertNotNull(warmedCounter);
        assertNotNull(lazyCounter);
    }
}
