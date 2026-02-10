package io.github.georgecodes.benchmarking.quarkus.application.port;

import java.util.Collection;

/**
 * Port for recording metrics.
 */
public interface MetricsPort {
    void incrementHelloRequest(String endpointTag);

    /**
     * Pre-registers (creates and registers) hello request counters for the provided endpoint tags.
     *
     * <p>This is intended to be called during application startup to keep the request hot path free
     * of meter registration work.
     *
     * @param endpointTags endpoint tag values to pre-register
     */
    void preRegisterHelloRequestCounters(Collection<String> endpointTags);
}