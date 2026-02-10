package io.github.georgecodes.benchmarking.quarkus.application;

import io.github.georgecodes.benchmarking.quarkus.application.port.CachePort;
import io.github.georgecodes.benchmarking.quarkus.application.port.HelloMode;
import io.github.georgecodes.benchmarking.quarkus.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.SleepPort;
import io.github.georgecodes.benchmarking.quarkus.application.port.TimeUnit;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Objects;

/**
 * Application/use-case layer. Keeps REST adapters thin and benchmarking logic centralized.
 */
@ApplicationScoped
public class HelloService {

    /**
     * Hot-path cache key used by all hello endpoints.
     */
    private static final String CACHE_KEY = "1";

    /**
     * Cache access abstraction.
     */
    private final CachePort cachePort;

    /**
     * Metrics abstraction.
     */
    private final MetricsPort metricsPort;

    /**
     * Time/sleep abstraction.
     */
    private final SleepPort sleepPort;

    public HelloService(CachePort cachePort, MetricsPort metricsPort, SleepPort sleepPort) {
        this.cachePort = Objects.requireNonNull(cachePort, "cachePort");
        this.metricsPort = Objects.requireNonNull(metricsPort, "metricsPort");
        this.sleepPort = Objects.requireNonNull(sleepPort, "sleepPort");
    }

    public String hello(HelloMode mode, int sleepSeconds) throws InterruptedException {
        Objects.requireNonNull(mode, "mode");

        if (sleepSeconds < 0) {
            throw new IllegalArgumentException("sleepSeconds must be >= 0");
        }

        metricsPort.incrementHelloRequest(mode.endpointTag());

        if (sleepSeconds > 0) {
            sleepPort.sleep(sleepSeconds, TimeUnit.SECONDS);
        }

        String v = cachePort.getIfPresent(CACHE_KEY);
        return mode.responsePrefix() + v;
    }
}