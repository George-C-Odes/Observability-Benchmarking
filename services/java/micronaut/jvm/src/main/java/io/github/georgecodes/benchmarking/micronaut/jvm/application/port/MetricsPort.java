package io.github.georgecodes.benchmarking.micronaut.jvm.application.port;

public interface MetricsPort {

    void incrementHelloRequest(String endpointTag);
}