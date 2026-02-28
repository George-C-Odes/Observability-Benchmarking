package io.github.georgecodes.benchmarking.helidon.mp.infra.metrics;

import jakarta.enterprise.inject.spi.Extension;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * CDI extension that initializes the OTel SDK as early as possible.
 * <p>
 * Helidon's {@code TracingCdiExtension} resolves the OpenTelemetry-backed
 * {@code Tracer} during CDI extension processing. If {@code GlobalOpenTelemetry}
 * has not been set yet, the tracer provider falls back to a no-op and traces
 * are silently lost.
 * <p>
 * The OTel SDK is initialized in this extension's <b>constructor</b>, which
 * runs when Weld loads extensions via {@code ServiceLoader} — before any
 * CDI lifecycle events ({@code BeforeBeanDiscovery}, etc.) fire. This
 * guarantees that {@code GlobalOpenTelemetry} is populated before any
 * Helidon tracing extension observer runs.
 * <p>
 * <b>Native-image safety:</b> During GraalVM native-image analysis, Weld runs
 * CDI bootstrap at build time to generate proxy classes. This extension detects
 * the build-time context and skips OTel SDK initialization (there is no OTLP
 * endpoint at build time). At actual runtime, the guard passes and the SDK
 * initializes normally.
 * <p>
 * Registered via {@code META-INF/services/jakarta.enterprise.inject.spi.Extension}.
 */
public class OtelSdkInitExtension implements Extension {

    /** Logger for early-initialization diagnostics. */
    private static final Logger LOG = LoggerFactory.getLogger(OtelSdkInitExtension.class);

    /**
     * Initializes the OTel SDK during extension instantiation — the earliest
     * possible point in the CDI lifecycle.
     */
    public OtelSdkInitExtension() {
        if (isNativeImageBuildTime()) {
            LOG.debug("Native-image build time detected — deferring OTel SDK init to runtime");
            return;
        }
        OtelConfig.initialize();
        LOG.info("OTel SDK initialized early via CDI extension constructor");
    }

    /**
     * Returns {@code true} when running inside a GraalVM native-image build
     * (analysis / image-build phase), {@code false} at normal JVM or native runtime.
     */
    private static boolean isNativeImageBuildTime() {
        try {
            Class<?> imageInfo = Class.forName("org.graalvm.nativeimage.ImageInfo");
            // inImageBuildtimeCode() returns true during analysis, false at runtime
            Object result = imageInfo.getMethod("inImageBuildtimeCode").invoke(null);
            return Boolean.TRUE.equals(result);
        } catch (Throwable ignored) {
            // Class not on classpath → not a native-image build
            return false;
        }
    }
}