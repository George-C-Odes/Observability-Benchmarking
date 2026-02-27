package io.github.georgecodes.benchmarking.micronaut.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.event.ApplicationEventListener;
import io.micronaut.runtime.event.ApplicationStartupEvent;
import jakarta.inject.Singleton;

@Factory
public class OtelConfig {

    /**
     * Bridges Micrometer → OTel MeterProvider.
     * Micronaut's CompositeMeterRegistry auto-discovers this bean
     * and adds it as a child registry. Any Counter/Timer/Gauge
     * recorded via Micrometer flows through the OTel SDK pipeline
     * → PeriodicMetricReader → OtlpGrpcMetricExporter → Alloy.
     */
    @Singleton
    public MeterRegistry otelMeterRegistry(OpenTelemetry openTelemetry) {
        return OpenTelemetryMeterRegistry.builder(openTelemetry).build();
    }

    /**
     * Installs the SDK into the Logback appender so buffered
     * log records (emitted before startup) are flushed and all
     * subsequent logs flow through the SDK's log pipeline.
     */
    @Singleton
    public ApplicationEventListener<ApplicationStartupEvent> otelLogbackInstaller(
            OpenTelemetry openTelemetry) {
        return _ -> OpenTelemetryAppender.install(openTelemetry);
    }
}