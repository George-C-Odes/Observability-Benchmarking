package io.github.georgecodes.benchmarking.micronaut.jvm.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

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
     * Tracks which binder classes have been bound to the global registry.
     *
     * <p>Micronaut tests can start multiple application contexts in the same JVM.
     * We bind these meters to Micrometer's global registry, so without this guard
     * we'd try to register the same meter IDs multiple times.
     */
    private static final Set<String> BOUND_BINDERS = ConcurrentHashMap.newKeySet();

    /**
     * Creates a meter binder for process memory metrics.
     *
     * @return MeterBinder instance for process memory metrics
     */
    @Singleton
    public MeterBinder processMemoryMetrics() {
        MeterBinder binder = new ProcessMemoryMetrics();
        bindOncePerBinder(binder);
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
        bindOncePerBinder(binder);
        return binder;
    }

    private static void bindOncePerBinder(MeterBinder binder) {
        String key = binder.getClass().getName();
        if (!BOUND_BINDERS.add(key)) {
            return;
        }
        binder.bindTo(Metrics.globalRegistry);
    }
}