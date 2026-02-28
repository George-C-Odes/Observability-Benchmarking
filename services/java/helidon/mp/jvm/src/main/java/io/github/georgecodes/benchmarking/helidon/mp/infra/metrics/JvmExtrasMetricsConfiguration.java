package io.github.georgecodes.benchmarking.helidon.mp.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Wires Micrometer JVM extras meter binders to the global registry on CDI startup.
 * <p>
 * Instance-based so that state is scoped and the class is testable.
 */
@ApplicationScoped
public class JvmExtrasMetricsConfiguration {

    /**
     * Tracks which binder classes have been bound to prevent double-binding.
     */
    private final Set<String> boundBinders = ConcurrentHashMap.newKeySet();

    /** The Micrometer registry to which binders are attached. */
    private final MeterRegistry registry;

    /** CDI-managed constructor — uses the global registry. */
    public JvmExtrasMetricsConfiguration() {
        this.registry = Metrics.globalRegistry;
    }

    /** Test-friendly constructor accepting a specific registry. */
    public JvmExtrasMetricsConfiguration(MeterRegistry registry) {
        this.registry = java.util.Objects.requireNonNull(registry, "registry");
    }

    void onStartup(@Observes @Initialized(ApplicationScoped.class) Object event) {
        register();
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