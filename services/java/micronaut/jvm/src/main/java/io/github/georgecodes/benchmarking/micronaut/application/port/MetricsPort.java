package io.github.georgecodes.benchmarking.micronaut.application.port;

public interface MetricsPort {

    void incrementHelloRequest(String endpointTag);
}