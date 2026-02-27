package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;

import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Wires Micrometer JVM extras meter binders to a given registry.
 * <p>
 * Instance-based so that state is scoped and the class is testable.
 */
public final class JvmExtrasMetricsConfiguration {

    /**
     * Tracks which binder classes have been bound to prevent double-binding.
     */
    private final Set<String> boundBinders = ConcurrentHashMap.newKeySet();
    /** The Micrometer registry to which binders are attached. */
    private final MeterRegistry registry;

    public JvmExtrasMetricsConfiguration(MeterRegistry registry) {
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    /**
     * Registers process memory and thread meter binders.
     */
    public void register() {
        bindOnce(new ProcessMemoryMetrics());
        bindOnce(new ProcessThreadMetrics());
    }

    private void bindOnce(MeterBinder binder) {
        String key = binder.getClass().getName();
        if (!boundBinders.add(key)) {
            return;
        }
        binder.bindTo(registry);
    }
}