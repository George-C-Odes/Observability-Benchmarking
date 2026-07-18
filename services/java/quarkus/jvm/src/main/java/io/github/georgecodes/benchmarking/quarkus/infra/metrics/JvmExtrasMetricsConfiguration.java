package io.github.georgecodes.benchmarking.quarkus.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;

/**
 * Infrastructure configuration that wires Micrometer JVM extras meter binders.
 *
 * <p>Kept in the infra layer to preserve clean architecture boundaries:
 * the application layer depends only on ports ({@code MetricsPort}), while metrics implementation and
 * binder wiring live in infra.
 */
@SuppressWarnings("unused")
public final class JvmExtrasMetricsConfiguration {

    /**
     * Creates a meter binder for process memory metrics.
     *
     * @return MeterBinder instance for process memory metrics
     */
    @Produces
    @ApplicationScoped
    MeterBinder processMemoryMetrics() {
        return new ProcessMemoryMetrics();
    }

    /**
     * Creates a meter binder for process thread metrics.
     *
     * @return MeterBinder instance for process thread metrics
     */
    @Produces
    @ApplicationScoped
    MeterBinder processThreadMetrics() {
        return registry -> {
            new ProcessThreadMetrics().bindTo(registry);
            bindProcessThreadsFallback(registry);
        };
    }

    private static void bindProcessThreadsFallback(MeterRegistry registry) {
        if (registry.find("process.threads").gauge() != null) {
            return;
        }

        ThreadMXBean threadMxBean = ManagementFactory.getThreadMXBean();
        Gauge.builder("process.threads", threadMxBean, ThreadMXBean::getThreadCount)
            .description("The number of process threads")
            .register(registry);
    }
}