package io.github.georgecodes.benchmarking.quarkus.infra.metrics;

import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Infrastructure adapter for Micrometer.
 */
@ApplicationScoped
public class MicrometerMetricsAdapter implements MetricsPort {

    /**
     * Micrometer registry from Quarkus.
     */
    private final MeterRegistry meterRegistry;

    /**
     * Counter cache to avoid rebuilding meters on the hot path.
     */
    private final ConcurrentHashMap<String, Counter> countersByEndpoint = new ConcurrentHashMap<>();

    public MicrometerMetricsAdapter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void incrementHelloRequest(String endpointTag) {
        Counter counter = countersByEndpoint.computeIfAbsent(endpointTag, tag ->
            Counter.builder("hello.request.count")
                .tag("endpoint", tag)
                .register(meterRegistry)
        );
        counter.increment();
    }
}