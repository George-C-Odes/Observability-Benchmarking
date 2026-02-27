package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.github.georgecodes.benchmarking.helidon.se.application.port.MetricsPort;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public final class MicrometerMetricsAdapter implements MetricsPort {

    /**
     * Cache counters by endpoint tag.
     * After warm-up (first call per tag), subsequent calls are a plain
     * {@link ConcurrentHashMap#get} — no locking, no allocation.
     */
    private final ConcurrentMap<String, Counter> countersByEndpoint = new ConcurrentHashMap<>(4);

    @Override
    public void incrementHelloRequest(String endpointTag) {
        countersByEndpoint
                .computeIfAbsent(endpointTag, MicrometerMetricsAdapter::buildCounter)
                .increment();
    }

    /**
     * Eagerly registers a counter for the given endpoint tag.
     * Call at startup for known tags to eliminate the first-request
     * {@code computeIfAbsent} penalty on the hot path.
     *
     * @param endpointTag the endpoint tag to pre-register
     */
    public void warmUp(String endpointTag) {
        countersByEndpoint.computeIfAbsent(endpointTag, MicrometerMetricsAdapter::buildCounter);
    }

    private static Counter buildCounter(String tag) {
        return Counter.builder("hello.request.count")
                .description("Hello request count")
                .tag("endpoint", tag)
                .register(Metrics.globalRegistry);
    }
}