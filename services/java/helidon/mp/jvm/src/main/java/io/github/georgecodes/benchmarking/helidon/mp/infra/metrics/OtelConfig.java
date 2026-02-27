package io.github.georgecodes.benchmarking.helidon.mp.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CDI producer for the OTel SDK. Initializes via autoconfigure and
 * bridges Micrometer → OTel.
 * <p>
 * All three signal pipelines (traces, metrics, logs) are wired via
 * OTEL_* environment variables and the OTLP/gRPC exporter.
 * <p>
 * The class uses {@code @ApplicationScoped} for CDI discovery.
 * The producer uses {@code @Singleton} to reduce proxy overhead.
 * Weld still generates {@code OpenTelemetry$_$$_WeldClientProxy} in the
 * {@code beanTypeClosureProxyPool}; the {@code WeldProxyBuildTimeInitFeature}
 * registers it for build-time initialization in native images.
 * <p>
 * <b>Design note:</b> The static {@link #initialize()} method is intentionally
 * called from {@link OtelSdkInitExtension} during CDI extension instantiation —
 * the earliest possible point in the lifecycle, before CDI wiring is available.
 * Constructor injection is not possible at that stage.
 *
 * @see OtelSdkInitExtension
 */
@Slf4j
@ApplicationScoped
public class OtelConfig {

    /** Guard to bridge Micrometer exactly once. */
    private static final AtomicBoolean BRIDGED = new AtomicBoolean(false);

    @Produces
    @Singleton
    public OpenTelemetry produceOpenTelemetry() {
        // The SDK is already initialized by OtelSdkInitExtension (constructor).
        // Reuse whatever GlobalOpenTelemetry holds; bridge Micrometer on first call.
        OpenTelemetry otel = initialize();
        bridgeMicrometer(otel);
        return otel;
    }

    /**
     * Initializes the OTel SDK via autoconfigure, or returns the existing
     * {@link GlobalOpenTelemetry} instance if it was already set (e.g. by
     * a previous call from {@link OtelSdkInitExtension}).
     * <p>
     * All exceptions are caught so that a misconfigured exporter or a missing
     * classpath entry (e.g. {@code opentelemetry-exporter-logging}) does not
     * crash the CDI container during extension loading.
     */
    static OpenTelemetry initialize() {
        try {
            var sdk = AutoConfiguredOpenTelemetrySdk.initialize()
                    .getOpenTelemetrySdk();
            log.info("OTel SDK initialized (autoconfigure)");
            return sdk;
        } catch (IllegalStateException e) {
            // GlobalOpenTelemetry already set (by a previous call or tests) — reuse.
            log.debug("OTel SDK already initialized, reusing GlobalOpenTelemetry");
            return GlobalOpenTelemetry.get();
        } catch (Exception e) {
            // Any other configuration error (missing exporter, bad env vars, …).
            // Fall back to whatever GlobalOpenTelemetry holds (may be noop).
            log.warn("OTel SDK autoconfigure failed ({}); falling back to GlobalOpenTelemetry",
                    e.getMessage());
            return GlobalOpenTelemetry.get();
        }
    }

    static void bridgeMicrometer(OpenTelemetry openTelemetry) {
        if (BRIDGED.compareAndSet(false, true)) {
            MeterRegistry otelRegistry = OpenTelemetryMeterRegistry.builder(openTelemetry).build();
            Metrics.globalRegistry.add(otelRegistry);
            log.info("Micrometer → OTel bridge registered");
        }
    }
}