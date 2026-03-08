package io.github.georgecodes.benchmarking.vertx.infra;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;

import java.util.Objects;

/**
 * Binds custom/extra metrics to Micrometer's global registry and provides
 * a pre-registered request counter for the reactive hello endpoint.
 * Export is handled by the OpenTelemetry Java agent (micrometer instrumentation).
 */
public final class MetricsProvider {

    /** Pre-registered counter for reactive endpoint requests. */
    private final Counter reactiveCounter;

    private MetricsProvider(Counter reactiveCounter) {
        this.reactiveCounter = Objects.requireNonNull(reactiveCounter, "reactiveCounter");
    }

    /**
     * Creates a MetricsProvider, binds JVM extras, and pre-registers the hello counter.
     *
     * @param endpointTag the endpoint tag value (e.g. "/hello/reactive")
     * @return a fully initialized MetricsProvider
     */
    public static MetricsProvider create(String endpointTag) {
        MeterRegistry registry = Metrics.globalRegistry;
        new ProcessMemoryMetrics().bindTo(registry);
        new ProcessThreadMetrics().bindTo(registry);

        Counter counter = Counter.builder("hello.request.count")
            .description("Hello request count")
            .tag("endpoint", endpointTag)
            .register(registry);

        return new MetricsProvider(counter);
    }

    /**
     * Increments the reactive hello request counter.
     */
    public void incrementReactive() {
        reactiveCounter.increment();
    }
}