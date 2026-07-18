package io.github.georgecodes.benchmarking.micronaut.infra.metrics;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.event.ApplicationEventListener;
import io.micronaut.runtime.event.ApplicationStartupEvent;
import jakarta.inject.Singleton;
import org.jspecify.annotations.NonNull;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadMXBean;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Infrastructure configuration that wires Micrometer JVM extras meter binders.
 *
 * <p>Kept in the infra layer to preserve clean architecture boundaries:
 * the application layer depends only on ports ({@code MetricsPort}), while metrics implementation and
 * binder wiring live in infra.
 */
@SuppressWarnings("unused")
@Factory
public final class JvmExtrasMetricsConfiguration {

    /** Procfs status file used by micrometer-jvm-extras on Linux-compatible runtimes. */
    private static final Path PROCFS_STATUS_PATH = Path.of("/proc/self/status");

    /** Metric name used for process thread counts across JVM extras and the fallback gauge. */
    private static final String PROCESS_THREADS_METRIC = "process.threads";

    /**
     * Binds JVM extras once the Micronaut application registry is ready.
     *
     * <p>Binding directly to the application {@link MeterRegistry} avoids routing the same meter
     * registration through both Micronaut's composite registry and
     * {@link io.micrometer.core.instrument.Metrics#globalRegistry}, which can otherwise reach the
     * OpenTelemetry child registry twice and emit duplicate-meter warnings.
     *
     * @param meterRegistry the Micronaut application registry
     * @return startup listener that installs process memory and thread metrics
     */
    @Singleton
    public ApplicationEventListener<ApplicationStartupEvent> jvmExtrasMetricsBinder(MeterRegistry meterRegistry) {
        return _ -> {
            new ProcessMemoryMetrics().bindTo(meterRegistry);
            new ProcessThreadsMeterBinder().bindTo(meterRegistry);
        };
    }

    private static final class ProcessThreadsMeterBinder implements MeterBinder {

        @Override
        public void bindTo(@NonNull MeterRegistry registry) {
            if (registry.find(PROCESS_THREADS_METRIC).gauge() != null) {
                return;
            }

            if (Files.isReadable(PROCFS_STATUS_PATH)) {
                new ProcessThreadMetrics().bindTo(registry);
            }

            bindProcessThreadsFallback(registry);
        }

        private static void bindProcessThreadsFallback(MeterRegistry registry) {
            if (registry.find(PROCESS_THREADS_METRIC).gauge() != null) {
                return;
            }

            ThreadMXBean threadMxBean = ManagementFactory.getThreadMXBean();
            Gauge.builder(PROCESS_THREADS_METRIC, threadMxBean, ThreadMXBean::getThreadCount)
                .description("The number of process threads")
                .register(registry);
        }
    }
}