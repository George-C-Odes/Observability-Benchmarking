package io.github.georgecodes.benchmarking.javalin.infra;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;

/**
 * Binds custom/extra metrics to Micrometer's global registry.
 * Export is handled by the OpenTelemetry Java agent (micrometer instrumentation).
 */
public final class MetricsProvider {

    private MetricsProvider() {
    }

    public static MeterRegistry bindToGlobal() {
        MeterRegistry registry = Metrics.globalRegistry;
        new ProcessMemoryMetrics().bindTo(registry);
        new ProcessThreadMetrics().bindTo(registry);
        return registry;
    }
}
