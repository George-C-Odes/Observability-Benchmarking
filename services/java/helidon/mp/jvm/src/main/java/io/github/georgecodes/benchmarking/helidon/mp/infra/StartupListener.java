package io.github.georgecodes.benchmarking.helidon.mp.infra;

import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import lombok.extern.slf4j.Slf4j;

import java.lang.reflect.Method;

/**
 * CDI startup listener that installs the OTel Logback appender,
 * pre-warms metrics counters, and logs runtime diagnostics.
 * <p>
 * <b>JVM mode:</b> The appender is declared in {@code logback.xml} and
 * {@code OpenTelemetryAppender.install(otel)} wires it to the SDK.
 * <p>
 * <b>Native mode:</b> The appender <b>cannot</b> appear in {@code logback.xml}
 * because Logback is initialized at build time and would instantiate the
 * appender into the image heap. Instead, we programmatically create the
 * appender, attach it to the root logger, and then install the SDK.
 *
 * @see JulBridgeStartupListener
 */
@Slf4j
@ApplicationScoped
public class StartupListener {

    /** CDI-managed OpenTelemetry instance initialized via {@code OtelConfig}. */
    @Inject
    private OpenTelemetry openTelemetry;

    /** CDI-managed Micrometer metrics adapter for pre-warming counters. */
    @Inject
    private MicrometerMetricsAdapter metricsAdapter;

    void onStartup(@Observes @Initialized(ApplicationScoped.class) Object event) {
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
        log.info("GlobalOpenTelemetry: {}", GlobalOpenTelemetry.get().getClass().getName());
        try {
            var tracer = io.helidon.tracing.Tracer.global();
            log.info("Helidon Tracer.global(): {} (enabled={})", tracer.getClass().getName(), tracer.enabled());
        } catch (Exception e) {
            log.warn("Helidon Tracer.global() failed: {}", e.getMessage());
        }

        Runtime runtime = Runtime.getRuntime();
        log.info("Helidon MP version: {}", io.helidon.common.Version.VERSION);
        log.info("Heap in MB = Max:{}, Total:{}, Free:{}",
                runtime.maxMemory() / 1024 / 1024,
                runtime.totalMemory() / 1024 / 1024,
                runtime.freeMemory() / 1024 / 1024);
        log.info("Available Processors: {}", runtime.availableProcessors());
    }

    /**
     * Installs the OTel Logback appender reflectively.
     * <p>
     * In JVM mode, logback.xml already declares the appender; we just wire the SDK.
     * In native mode, logback.xml intentionally omits it (build-time init conflict),
     * so we create the appender programmatically and attach it to the root logger
     * before wiring the SDK.
     */
    private void installOtelLogbackAppender() {
        try {
            Class<?> appenderClass = Class.forName(
                    "io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender");

            // If running in native image, the appender is not in logback.xml —
            // create it programmatically and attach to the root logger.
            if (isNativeImage()) {
                attachAppenderProgrammatically(appenderClass);
            }

            // Wire the SDK to all OpenTelemetryAppender instances (both XML-declared and programmatic).
            Method install = appenderClass.getMethod("install", OpenTelemetry.class);
            install.invoke(null, openTelemetry);
            log.info("OTel logback appender installed");
        } catch (ClassNotFoundException e) {
            log.debug("OTel logback appender not on classpath; skipping install");
        } catch (Exception e) {
            log.warn("OTel logback appender install failed: {}", e.getMessage());
        }
    }

    /**
     * Creates an {@code OpenTelemetryAppender} instance, configures it,
     * and attaches it to the SLF4J/Logback root logger — all via reflection
     * to avoid compile-time dependency on the appender class.
     */
    private static void attachAppenderProgrammatically(Class<?> appenderClass) {
        try {
            // Create and configure the appender
            Object appender = appenderClass.getDeclaredConstructor().newInstance();
            appenderClass.getMethod("setCaptureExperimentalAttributes", boolean.class)
                    .invoke(appender, true);
            appenderClass.getMethod("setCaptureMdcAttributes", String.class)
                    .invoke(appender, "*");

            // Get the Logback root logger and attach the appender
            var rootLogger = (ch.qos.logback.classic.Logger)
                    org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
            var logbackAppender = (ch.qos.logback.core.Appender<?>) appender;

            // The appender needs a context and must be started
            logbackAppender.setContext(rootLogger.getLoggerContext());
            logbackAppender.setName("OTEL");
            logbackAppender.start();

            @SuppressWarnings("unchecked")
            var typedAppender =
                    (ch.qos.logback.core.Appender<ch.qos.logback.classic.spi.ILoggingEvent>) logbackAppender;
            rootLogger.addAppender(typedAppender);

            log.info("OTel logback appender attached programmatically (native mode)");
        } catch (Exception e) {
            log.warn("Failed to attach OTel logback appender programmatically: {}", e.getMessage());
        }
    }

    private static boolean isNativeImage() {
        try {
            Class<?> imageInfo = Class.forName("org.graalvm.nativeimage.ImageInfo");
            Object result = imageInfo.getMethod("inImageCode").invoke(null);
            return Boolean.TRUE.equals(result);
        } catch (Throwable ignored) {
            return false;
        }
    }
}