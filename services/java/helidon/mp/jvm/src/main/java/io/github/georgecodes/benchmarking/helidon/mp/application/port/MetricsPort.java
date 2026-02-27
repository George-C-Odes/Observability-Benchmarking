package io.github.georgecodes.benchmarking.helidon.mp.application.port;

/**
 * Metrics abstraction.
 */
public interface MetricsPort {

    void incrementHelloRequest(String endpointTag);
}