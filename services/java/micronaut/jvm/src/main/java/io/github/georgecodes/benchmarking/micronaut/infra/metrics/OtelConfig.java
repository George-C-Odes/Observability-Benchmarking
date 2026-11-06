package io.github.georgecodes.benchmarking.micronaut.infra.metrics;

import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.config.MeterFilter;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.event.ApplicationEventListener;
import io.micronaut.runtime.event.ApplicationStartupEvent;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import jakarta.inject.Singleton;
import org.jspecify.annotations.NullMarked;

@SuppressWarnings("unused")
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
    @SuppressWarnings("MethodMayBeStatic") // Keep Micronaut factory methods as instance methods.
    public MeterRegistry otelMeterRegistry(OpenTelemetry openTelemetry) {
        var registry = OpenTelemetryMeterRegistry.builder(openTelemetry).build();
        // Micronaut's Netty queue gauge omits the unit; Micrometer's thread-pool gauge uses tasks.
        // OTel requires a consistent unit for instruments sharing a name, regardless of their tags.
        registry.config().meterFilter(new MeterFilter() {
            @Override
            @NullMarked
            public Meter.Id map(Meter.Id id) {
                return "executor.queued".equals(id.getName()) ? id.withBaseUnit("tasks") : id;
            }
        });
        return registry;
    }

    /**
     * Installs the SDK into the Logback appender so buffered
     * log records (emitted before startup) are flushed and all
     * subsequent logs flow through the SDK's log pipeline.
     */
    @Singleton
    @SuppressWarnings("MethodMayBeStatic") // Keep Micronaut factory methods as instance methods.
    public ApplicationEventListener<ApplicationStartupEvent> otelLogbackInstaller(
            OpenTelemetry openTelemetry) {
        return _ -> OpenTelemetryAppender.install(openTelemetry);
    }
}
