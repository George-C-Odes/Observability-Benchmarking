package io.github.georgecodes.benchmarking.helidon.se.application.port;

public interface MetricsPort {

    void incrementHelloRequest(String endpointTag);
}