package io.github.georgecodes.benchmarking.quarkus.infra.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MicrometerMetricsAdapterTest {

    @Test
    void preRegisterHelloRequestCountersRejectsNullCollections() {
        MicrometerMetricsAdapter adapter = new MicrometerMetricsAdapter(new SimpleMeterRegistry());

        assertThrows(NullPointerException.class, () -> adapter.preRegisterHelloRequestCounters(null));
    }

    @Test
    void preRegisterHelloRequestCountersSkipsBlankNullAndDuplicateTags() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerMetricsAdapter adapter = new MicrometerMetricsAdapter(registry);

        adapter.preRegisterHelloRequestCounters(
            Arrays.asList("/hello/platform", null, "", " ", "/hello/platform", "/hello/reactive")
        );

        assertEquals(2, registry.getMeters().size());
        assertNotNull(counter(registry, "/hello/platform"));
        assertNotNull(counter(registry, "/hello/reactive"));
        assertNull(registry.find("hello.request.count").tag("endpoint", "/hello/virtual").counter());
    }

    @Test
    void incrementHelloRequestUsesExistingPreRegisteredCounter() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerMetricsAdapter adapter = new MicrometerMetricsAdapter(registry);

        adapter.preRegisterHelloRequestCounters(List.of("/hello/platform"));
        adapter.incrementHelloRequest("/hello/platform");
        adapter.incrementHelloRequest("/hello/platform");

        assertEquals(1, registry.getMeters().size());
        assertEquals(2.0d, counter(registry, "/hello/platform").count());
    }

    @Test
    void incrementHelloRequestLazilyRegistersMissingCounters() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        MicrometerMetricsAdapter adapter = new MicrometerMetricsAdapter(registry);

        adapter.incrementHelloRequest("/hello/virtual");

        assertEquals(1, registry.getMeters().size());
        assertEquals(1.0d, counter(registry, "/hello/virtual").count());
    }

    private static Counter counter(SimpleMeterRegistry registry, String endpointTag) {
        return registry.get("hello.request.count")
            .tag("endpoint", endpointTag)
            .counter();
    }
}


