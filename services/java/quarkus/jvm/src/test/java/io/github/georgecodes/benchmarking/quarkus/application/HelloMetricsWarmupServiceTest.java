package io.github.georgecodes.benchmarking.quarkus.application;

import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HelloMetricsWarmupServiceTest {

    @Test
    void warmupHelloCountersPreRegistersEveryHelloEndpoint() {
        RecordingMetricsPort metricsPort = new RecordingMetricsPort();
        HelloMetricsWarmupService service = new HelloMetricsWarmupService(metricsPort);

        service.warmupHelloCounters();

        assertEquals(
            List.of("/hello/platform", "/hello/virtual", "/hello/reactive"),
            metricsPort.preRegisteredEndpointTags
        );
    }

    private static final class RecordingMetricsPort implements MetricsPort {
        private List<String> preRegisteredEndpointTags = List.of();

        @Override
        public void incrementHelloRequest(String endpointTag) {
            // Not needed in these tests.
        }

        @Override
        public void preRegisterHelloRequestCounters(Collection<String> endpointTags) {
            preRegisteredEndpointTags = new ArrayList<>(endpointTags);
        }
    }
}

