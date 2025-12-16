package com.benchmarking.config;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

/**
 * Configuration class for Micrometer metrics setup.
 * Provides custom meter binders for process memory and thread metrics.
 */
@ApplicationScoped
public class MetricsConfig {

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
        return new ProcessThreadMetrics();
    }
}
