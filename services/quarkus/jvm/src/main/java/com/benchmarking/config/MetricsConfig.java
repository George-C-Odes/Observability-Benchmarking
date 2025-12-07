package com.benchmarking.config;

import io.github.mweirauch.micrometer.jvm.extras.ProcessMemoryMetrics;
import io.github.mweirauch.micrometer.jvm.extras.ProcessThreadMetrics;
import io.micrometer.core.instrument.binder.MeterBinder;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

@ApplicationScoped
public class MetricsConfig {
    @Produces
    @ApplicationScoped
    MeterBinder processMemoryMetrics() {
        return new ProcessMemoryMetrics();
    }

    @Produces
    @ApplicationScoped
    MeterBinder processThreadMetrics() {
        return new ProcessThreadMetrics();
    }
}