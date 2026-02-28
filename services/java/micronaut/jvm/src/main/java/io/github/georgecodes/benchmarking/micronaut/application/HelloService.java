package io.github.georgecodes.benchmarking.micronaut.application;

import io.github.georgecodes.benchmarking.micronaut.application.port.CachePort;
import io.github.georgecodes.benchmarking.micronaut.application.port.HelloMode;
import io.github.georgecodes.benchmarking.micronaut.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.micronaut.application.port.SleepPort;
import io.github.georgecodes.benchmarking.micronaut.application.port.TimeUnit;
import jakarta.inject.Singleton;

/**
 * MicronautApplication/use-case layer.
 */
@Singleton
public class HelloService {

    /** Cache lookup key (fixed value to minimize work during benchmarking). */
    private static final String CACHE_KEY = "1";

    /** Fixed response prefix to reduce repeated string constant concatenations. */
    private static final String RESPONSE_PREFIX = "Hello from Micronaut ";
    /** Fixed response infix to reduce repeated string constant concatenations. */
    private static final String RESPONSE_INFIX = " REST ";

    /** Cache access port (infrastructure-adapter backed). */
    private final CachePort cachePort;
    /** Metrics port used to count requests by endpoint. */
    private final MetricsPort metricsPort;
    /** Sleep port used to simulate latency when requested. */
    private final SleepPort sleepPort;

    public HelloService(CachePort cachePort, MetricsPort metricsPort, SleepPort sleepPort) {
        this.cachePort = cachePort;
        this.metricsPort = metricsPort;
        this.sleepPort = sleepPort;
    }

    public String hello(HelloMode mode, int sleepSeconds) {
        metricsPort.incrementHelloRequest(mode.endpointTag());
        if (sleepSeconds > 0) {
            try {
                sleepPort.sleep(sleepSeconds, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        String v = cachePort.getIfPresent(CACHE_KEY);
        return RESPONSE_PREFIX + mode.label() + RESPONSE_INFIX + v;
    }
}