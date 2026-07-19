package io.github.georgecodes.benchmarking.micronaut.infra.metrics;

import io.github.georgecodes.benchmarking.micronaut.application.port.MetricsPort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.inject.Singleton;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@SuppressWarnings("unused")
@Singleton
public final class MicrometerMetricsAdapter implements MetricsPort {

    /** Application meter registry used for Micrometer counters exported through the OTel bridge. */
    private final MeterRegistry meterRegistry;

    /** Cache counters by endpoint tag to avoid per-request builder/lookup overhead. */
    private final ConcurrentMap<String, Counter> countersByEndpoint =
        new ConcurrentHashMap<>(HelloModeCount.EXPECTED_SIZE);

    MicrometerMetricsAdapter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void incrementHelloRequest(String endpointTag) {
        countersByEndpoint
            .computeIfAbsent(endpointTag, tag -> Counter.builder("hello.request.count")
                .description("Hello request count")
                .tag("endpoint", tag)
                .register(meterRegistry))
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