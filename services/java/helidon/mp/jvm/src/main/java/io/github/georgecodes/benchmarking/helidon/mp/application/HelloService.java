package io.github.georgecodes.benchmarking.helidon.mp.application;

import io.github.georgecodes.benchmarking.helidon.mp.application.port.CachePort;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.MetricsPort;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.SleepPort;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.TimeUnit;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Objects;

/**
 * Application/use-case layer. Keeps REST resources thin and benchmarking logic centralized.
 * <p>
 * Managed as an {@link ApplicationScoped} CDI bean — single instance per application.
 */
@ApplicationScoped
public class HelloService {

    /** Hot-path cache key used by all hello endpoints. */
    private static final String CACHE_KEY = "1";

    /** Cache abstraction used to retrieve the benchmark value. */
    private final CachePort cachePort;

    /** Metrics abstraction used to record per-endpoint request counts. */
    private final MetricsPort metricsPort;

    /** Sleep abstraction used to simulate work with minimal allocation overhead. */
    private final SleepPort sleepPort;

    @Inject
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