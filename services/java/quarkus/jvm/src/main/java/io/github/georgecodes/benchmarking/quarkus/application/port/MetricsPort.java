package io.github.georgecodes.benchmarking.quarkus.application.port;

/**
 * Port for recording metrics.
 */
public interface MetricsPort {
    void incrementHelloRequest(String endpointTag);
}