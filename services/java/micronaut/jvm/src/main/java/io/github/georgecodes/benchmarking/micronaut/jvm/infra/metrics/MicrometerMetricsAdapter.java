package io.github.georgecodes.benchmarking.micronaut.jvm.infra.metrics;

import io.github.georgecodes.benchmarking.micronaut.jvm.application.port.MetricsPort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import jakarta.inject.Singleton;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Singleton
public final class MicrometerMetricsAdapter implements MetricsPort {

    /** Cache counters by endpoint tag to avoid per-request builder/lookup overhead. */
    private final ConcurrentMap<String, Counter> countersByEndpoint =
        new ConcurrentHashMap<>(HelloModeCount.EXPECTED_SIZE);

    @Override
    public void incrementHelloRequest(String endpointTag) {
        countersByEndpoint
            .computeIfAbsent(endpointTag, tag -> Counter.builder("hello.request.count")
                .description("Hello request count")
                .tag("endpoint", tag)
                .register(Metrics.globalRegistry))
            .increment();
    }

    /** Small constant holder to avoid magic numbers and keep class init cheap. */
    private static final class HelloModeCount {
        /** Number of endpoint tags expected (platform/virtual/virtual-event-loop/reactive). */
        private static final int EXPECTED_SIZE = 4;

        private HelloModeCount() {
        }
    }
}