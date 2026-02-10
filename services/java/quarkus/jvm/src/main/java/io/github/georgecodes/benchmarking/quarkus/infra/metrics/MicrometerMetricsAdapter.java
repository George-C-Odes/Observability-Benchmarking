package io.github.georgecodes.benchmarking.quarkus.infra.metrics;

import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.enterprise.context.ApplicationScoped;
import lombok.RequiredArgsConstructor;

import java.util.Collection;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Infrastructure adapter for Micrometer.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class MicrometerMetricsAdapter implements MetricsPort {

    /**
     * Micrometer registry from Quarkus.
     */
    private final MeterRegistry meterRegistry;

    /**
     * Counter cache to avoid rebuilding meters on the hot path.
     */
    private final ConcurrentHashMap<String, Counter> countersByEndpoint =
        new ConcurrentHashMap<>(HelloModeCount.EXPECTED_SIZE);


    @Override
    public void preRegisterHelloRequestCounters(Collection<String> endpointTags) {
        Objects.requireNonNull(endpointTags, "endpointTags");

        for (String tag : endpointTags) {
            if (tag == null || tag.isBlank()) {
                continue;
            }
            countersByEndpoint.computeIfAbsent(tag, this::registerHelloCounter);
        }
    }

    @Override
    public void incrementHelloRequest(String endpointTag) {
        // Expected to be warmed up at startup, but keep safe lazy behavior for robustness.
        countersByEndpoint
            .computeIfAbsent(endpointTag, this::registerHelloCounter)
            .increment();
    }

    private Counter registerHelloCounter(String endpointTag) {
        return Counter.builder("hello.request.count")
            .description("Hello request count")
            .tag("endpoint", endpointTag)
            .register(meterRegistry);
    }

    /** Small constant holder to avoid magic numbers and keep class init cheap. */
    private static final class HelloModeCount {
        /** Number of endpoint tags expected (platform/virtual/reactive). */
        private static final int EXPECTED_SIZE = 3;

        private HelloModeCount() {
        }
    }
}