package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import lombok.extern.slf4j.Slf4j;

/**
 * Initializes the OTel SDK via autoconfigure and bridges Micrometer → OTel.
 * <p>
 * All three signal pipelines (traces, metrics, logs) are wired via
 * OTEL_* environment variables and the OTLP/gRPC exporter.
 */
@Slf4j
public final class OtelConfig {

    private OtelConfig() {
    }

    /**
     * Creates and registers a global {@link OpenTelemetrySdk} instance
     * using the SDK autoconfigure module. Configuration is driven by
     * OTEL_* environment variables.
     *
     * @return the initialized {@link OpenTelemetry} instance
     */
    public static OpenTelemetry initialize() {
        OpenTelemetrySdk sdk = AutoConfiguredOpenTelemetrySdk.initialize()
                .getOpenTelemetrySdk();
        log.info("OTel SDK initialized (autoconfigure)");
        return sdk;
    }

    /**
     * Bridges Micrometer → OTel MeterProvider.
     * Any Counter/Timer/Gauge recorded via Micrometer flows through
     * the OTel SDK pipeline → PeriodicMetricReader → OtlpGrpcMetricExporter → Alloy.
     *
     * @param openTelemetry the initialized OTel instance
     */
    public static void bridgeMicrometer(OpenTelemetry openTelemetry) {
        MeterRegistry otelRegistry = OpenTelemetryMeterRegistry.builder(openTelemetry).build();
        Metrics.globalRegistry.add(otelRegistry);
        log.info("Micrometer → OTel bridge registered");
    }
}