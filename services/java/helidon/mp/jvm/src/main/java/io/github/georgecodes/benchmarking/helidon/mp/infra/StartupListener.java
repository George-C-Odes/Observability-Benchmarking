package io.github.georgecodes.benchmarking.helidon.mp.infra;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.helidon.common.Version;
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

    /** Environment/system property used to tune intentionally noisy OTel span-drop warnings. */
    private static final String OTEL_BSP_LOG_LEVEL = "OTEL_BSP_LOG_LEVEL";

    /** System property name produced by the native bootstrap's OTEL_* environment promotion. */
    private static final String OTEL_BSP_LOG_LEVEL_PROPERTY = "otel.bsp.log.level";

    /** OTel SDK logger that emits queue-full span-drop warnings during sampled load tests. */
    private static final String BATCH_SPAN_PROCESSOR_LOGGER =
            "io.opentelemetry.sdk.trace.export.BatchSpanProcessor";

    /** Defensive fallback for implementations that log from the nested worker class logger. */
    private static final String BATCH_SPAN_PROCESSOR_WORKER_LOGGER =
            BATCH_SPAN_PROCESSOR_LOGGER + "$Worker";

    /** Guard to bridge Micrometer exactly once if CDI startup events are replayed in tests. */
    private static final AtomicBoolean MICROMETER_BRIDGED = new AtomicBoolean(false);

    /** CDI-managed OpenTelemetry instance initialized by Helidon MP Telemetry. */
    private final OpenTelemetry openTelemetry;

    /** CDI-managed Micrometer metrics adapter for pre-warming counters. */
    private final MicrometerMetricsAdapter metricsAdapter;

    @Inject
    public StartupListener(OpenTelemetry openTelemetry, MicrometerMetricsAdapter metricsAdapter) {
        this.openTelemetry = openTelemetry;
        this.metricsAdapter = metricsAdapter;
    }

    void onStartup(@Observes @Initialized(ApplicationScoped.class) Object event) {
        configureBatchSpanProcessorLogLevel();
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
        log.info("Helidon MP version: {}", Version.VERSION);
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

    private void configureBatchSpanProcessorLogLevel() {
        Level level = Level.toLevel(configuredBspLogLevel(), Level.WARN);
        setLoggerLevel(BATCH_SPAN_PROCESSOR_LOGGER, level);
        setLoggerLevel(BATCH_SPAN_PROCESSOR_WORKER_LOGGER, level);
    }

    private String configuredBspLogLevel() {
        String value = System.getenv(OTEL_BSP_LOG_LEVEL);
        if (value == null || value.isBlank()) {
            value = System.getProperty(OTEL_BSP_LOG_LEVEL);
        }
        if (value == null || value.isBlank()) {
            value = System.getProperty(OTEL_BSP_LOG_LEVEL_PROPERTY);
        }
        return value == null || value.isBlank() ? Level.WARN.levelStr : value;
    }

    private void setLoggerLevel(String loggerName, Level level) {
        Logger logger = (Logger) LoggerFactory.getLogger(loggerName);
        logger.setLevel(level);
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
