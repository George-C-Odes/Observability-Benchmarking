package io.github.georgecodes.benchmarking.helidon.mp.infra;

import ch.qos.logback.classic.Logger;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * CDI startup listener that bridges Micrometer to the Helidon MP Telemetry
 * {@link OpenTelemetry} instance, installs the OTel Logback appender,
 * pre-warms metrics counters, and logs runtime diagnostics.
 * <p>
 * Helidon's {@code helidon-microprofile-telemetry} dependency owns OTel SDK
 * autoconfiguration and JAX-RS tracing. This class only wires benchmark-local
 * Micrometer meters and Logback logs into that SDK so all signals continue to
 * use the same OTLP/gRPC batch pipeline to Alloy.
 *
 * @see JulBridgeStartupListener
 */
@Slf4j
@ApplicationScoped
public class StartupListener {

    /** Logback appender name used by both XML-configured JVM logging and native programmatic logging. */
    private static final String OTEL_APPENDER_NAME = "OTEL";

    /** Guard to bridge Micrometer exactly once if CDI startup events are replayed in tests. */
    private static final AtomicBoolean MICROMETER_BRIDGED = new AtomicBoolean(false);

    /** CDI-managed OpenTelemetry instance initialized by Helidon MP Telemetry. */
    @Inject
    private OpenTelemetry openTelemetry;

    /** CDI-managed Micrometer metrics adapter for pre-warming counters. */
    @Inject
    private MicrometerMetricsAdapter metricsAdapter;

    void onStartup(@Observes @Initialized(ApplicationScoped.class) Object event) {
        bridgeMicrometer();
        installOtelLogbackAppender();
        warmUpMetrics();
        logDiagnostics();
    }

    /**
     * Pre-warm Micrometer counters for all known HelloMode endpoint tags
     * so the first request doesn't pay the computeIfAbsent penalty.
     */
    private void warmUpMetrics() {
        for (HelloMode mode : HelloMode.values()) {
            metricsAdapter.warmUp(mode.endpointTag());
        }
    }

    private void logDiagnostics() {
        log.info("CDI OpenTelemetry bean: {}", openTelemetry.getClass().getName());

        Runtime runtime = Runtime.getRuntime();
        log.info("Helidon MP version: {}", io.helidon.common.Version.VERSION);
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}",
                runtime.maxMemory() / 1024 / 1024,
                runtime.totalMemory() / 1024 / 1024,
                runtime.freeMemory() / 1024 / 1024);
        log.info("Available Processors: {}", runtime.availableProcessors());
    }

    private void bridgeMicrometer() {
        if (MICROMETER_BRIDGED.compareAndSet(false, true)) {
            MeterRegistry otelRegistry = OpenTelemetryMeterRegistry.builder(openTelemetry).build();
            Metrics.globalRegistry.add(otelRegistry);
            log.info("Micrometer to OTel bridge registered");
        }
    }

    private void installOtelLogbackAppender() {
        try {
            ensureOtelLogbackAppenderExists();
            OpenTelemetryAppender.install(openTelemetry);
            log.info("OTel logback appender installed");
        } catch (Exception e) {
            log.warn("OTel logback appender install failed: {}", e.getMessage());
        }
    }

    private void ensureOtelLogbackAppenderExists() {
        Logger rootLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(
                org.slf4j.Logger.ROOT_LOGGER_NAME);
        if (rootLogger.getAppender(OTEL_APPENDER_NAME) != null) {
            return;
        }

        OpenTelemetryAppender appender = new OpenTelemetryAppender();
        appender.setName(OTEL_APPENDER_NAME);
        appender.setContext(rootLogger.getLoggerContext());
        appender.setCaptureExperimentalAttributes(true);
        appender.setCaptureMdcAttributes("*");
        appender.setOpenTelemetry(openTelemetry);
        appender.start();
        rootLogger.addAppender(appender);
    }
}
