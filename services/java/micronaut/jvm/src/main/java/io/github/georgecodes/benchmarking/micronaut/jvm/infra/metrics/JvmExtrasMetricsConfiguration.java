package io.github.georgecodes.benchmarking.micronaut.jvm.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;

/**
 * Infrastructure configuration that wires Micrometer JVM extras meter binders.
 *
 * <p>Kept in the infra layer to preserve clean architecture boundaries:
 * the application layer depends only on ports ({@code MetricsPort}), while metrics implementation and
 * binder wiring live in infra.
 */
@Factory
public final class JvmExtrasMetricsConfiguration {

    /**
     * Tracks whether the JVM extras meter binders have been bound to the global registry.
     *
     * <p>Volatile is used to ensure visibility across threads and to avoid binding the same
     * metrics multiple times when multiple beans are initialized concurrently.
     */
    private static volatile boolean bound;

    /**
     * Creates a meter binder for process memory metrics.
     *
     * @return MeterBinder instance for process memory metrics
     */
    @Singleton
    public MeterBinder processMemoryMetrics() {
        MeterBinder binder = new ProcessMemoryMetrics();
        bindOnce(binder);
        return binder;
    }

    /**
     * Creates a meter binder for process thread metrics.
     *
     * @return MeterBinder instance for process thread metrics
     */
    @Singleton
    public MeterBinder processThreadMetrics() {
        MeterBinder binder = new ProcessThreadMetrics();
        bindOnce(binder);
        return binder;
    }

    private static void bindOnce(MeterBinder binder) {
        if (bound) {
            return;
        }
        synchronized (JvmExtrasMetricsConfiguration.class) {
            if (bound) {
                return;
            }
            binder.bindTo(Metrics.globalRegistry);
            bound = true;
        }
    }
}