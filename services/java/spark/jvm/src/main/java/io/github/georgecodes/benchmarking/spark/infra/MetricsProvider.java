package io.github.georgecodes.benchmarking.spark.infra;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;

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
        bindProcessThreadsFallback(registry);
        return registry;
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
