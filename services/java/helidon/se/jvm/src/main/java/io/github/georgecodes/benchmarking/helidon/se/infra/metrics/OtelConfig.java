package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.sdk.common.export.GrpcSenderProvider;
import io.opentelemetry.instrumentation.micrometer.v1_5.OpenTelemetryMeterRegistry;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ServiceLoader;

/**
 * Initializes the OTel SDK via autoconfigure and bridges Micrometer → OTel.
 * <p>
 * All three signal pipelines (traces, metrics, logs) are wired via
 * OTEL_* environment variables and the OTLP/gRPC exporter.
 */
@Slf4j
public final class OtelConfig {

    /** Default OTLP protocol used by the OTel SDK when no override is provided. */
    static final String DEFAULT_OTLP_PROTOCOL = "grpc";

    /** Global system property for the OTLP protocol. */
    static final String OTLP_PROTOCOL_PROPERTY = "otel.exporter.otlp.protocol";

    /** Global environment variable for the OTLP protocol. */
    static final String OTLP_PROTOCOL_ENV = "OTEL_EXPORTER_OTLP_PROTOCOL";

    /** Global system property for the OTLP endpoint. */
    static final String OTLP_ENDPOINT_PROPERTY = "otel.exporter.otlp.endpoint";

    /** Global environment variable for the OTLP endpoint. */
    static final String OTLP_ENDPOINT_ENV = "OTEL_EXPORTER_OTLP_ENDPOINT";

    /** Helidon tracing system property for the collector protocol. */
    static final String TRACING_PROTOCOL_PROPERTY = "tracing.protocol";

    /** Helidon tracing system property for the collector host. */
    static final String TRACING_HOST_PROPERTY = "tracing.host";

    /** Helidon tracing system property for the collector port. */
    static final String TRACING_PORT_PROPERTY = "tracing.port";

    /** Helidon tracing system property for the collector path. */
    static final String TRACING_PATH_PROPERTY = "tracing.path";

    /** Helidon tracing system property for the resource service name. */
    static final String TRACING_SERVICE_PROPERTY = "tracing.service";

    /** Helidon tracing provider exporter type property. */
    static final String TRACING_EXPORTER_TYPE_PROPERTY = "tracing.exporter-type";

    /** Helidon tracing system property for BatchSpanProcessor queue capacity. */
    static final String TRACING_MAX_QUEUE_SIZE_PROPERTY = "tracing.max-queue-size";

    /** Helidon tracing system property for BatchSpanProcessor export batch size. */
    static final String TRACING_MAX_EXPORT_BATCH_SIZE_PROPERTY = "tracing.max-export-batch-size";

    /** Helidon tracing system property for BatchSpanProcessor schedule delay. */
    static final String TRACING_SCHEDULE_DELAY_PROPERTY = "tracing.schedule-delay";

    /** Helidon tracing system property for BatchSpanProcessor export timeout. */
    static final String TRACING_EXPORT_TIMEOUT_PROPERTY = "tracing.export-timeout";

    /** System property used by OTel to choose a gRPC sender implementation. */
    static final String GRPC_SENDER_PROVIDER_PROPERTY = "io.opentelemetry.sdk.common.export.GrpcSenderProvider";

    /** Preferred OkHttp-based gRPC sender provider for OTLP exports. */
    static final String OKHTTP_GRPC_SENDER_PROVIDER =
            "io.opentelemetry.exporter.sender.okhttp.internal.OkHttpGrpcSenderProvider";

    /** Supported OTLP signal names resolved from signal-specific or global protocol settings. */
    private static final List<String> OTLP_SIGNALS = List.of("traces", "metrics", "logs");

    /** Environment-to-system-property mappings consumed by OTel SDK autoconfigure. */
    private static final Map<String, String> OTEL_ENV_PROPERTY_MAPPINGS = Map.ofEntries(
            Map.entry(OTLP_ENDPOINT_ENV, OTLP_ENDPOINT_PROPERTY),
            Map.entry("OTEL_EXPORTER_OTLP_PROTOCOL", OTLP_PROTOCOL_PROPERTY),
            Map.entry("OTEL_TRACES_EXPORTER", "otel.traces.exporter"),
            Map.entry("OTEL_METRICS_EXPORTER", "otel.metrics.exporter"),
            Map.entry("OTEL_LOGS_EXPORTER", "otel.logs.exporter"),
            Map.entry("OTEL_METRIC_EXPORT_INTERVAL", "otel.metric.export.interval"),
            Map.entry("OTEL_TRACES_SAMPLER", "otel.traces.sampler"),
            Map.entry("OTEL_SERVICE_NAME", "otel.service.name"),
            Map.entry("OTEL_RESOURCE_ATTRIBUTES", "otel.resource.attributes"),
            Map.entry("OTEL_BSP_MAX_QUEUE_SIZE", "otel.bsp.max.queue.size"),
            Map.entry("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "otel.bsp.max.export.batch.size"),
            Map.entry("OTEL_BSP_SCHEDULE_DELAY", "otel.bsp.schedule.delay"),
            Map.entry("OTEL_BSP_EXPORT_TIMEOUT", "otel.bsp.export.timeout"));

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
        configureSystemPropertiesFromEnvironment();
        configureGrpcSenderProvider();
        OpenTelemetrySdk sdk = AutoConfiguredOpenTelemetrySdk.initialize()
                .getOpenTelemetrySdk();
        log.info("OTel SDK initialized (autoconfigure)");
        return sdk;
    }

    /**
     * Copies supported OTEL_* environment settings into system properties used by both
     * OTel SDK autoconfigure and Helidon's tracing provider.
     * <p>
     * Call this before creating Helidon {@code Config}; existing system properties are
     * preserved so explicit JVM arguments always win.
     */
    public static void configureSystemPropertiesFromEnvironment() {
        configureSystemPropertiesFromEnvironment(System.getenv());
    }

    static void configureSystemPropertiesFromEnvironment(Map<String, String> environment) {
        configureAutoconfigureSystemProperties(environment);
        configureHelidonTracingSystemProperties(environment);
    }

    static void configureAutoconfigureSystemProperties(Map<String, String> environment) {
        OTEL_ENV_PROPERTY_MAPPINGS.forEach((envName, propertyName) -> {
            String envValue = environment.get(envName);
            if (envValue != null && !envValue.isBlank() && isBlank(System.getProperty(propertyName))) {
                System.setProperty(propertyName, envValue.trim());
            }
        });
    }

    static void configureHelidonTracingSystemProperties(Map<String, String> environment) {
        String endpoint = firstNonBlank(
                System.getProperty(OTLP_ENDPOINT_PROPERTY),
                environment.get(OTLP_ENDPOINT_ENV));

        if (endpoint != null) {
            configureHelidonTracingEndpoint(endpoint);
        }

        if (isBlank(System.getProperty(TRACING_EXPORTER_TYPE_PROPERTY))) {
            String protocol = firstNonBlank(
                    System.getProperty(OTLP_PROTOCOL_PROPERTY),
                    environment.get(OTLP_PROTOCOL_ENV));
            if (protocol == null || DEFAULT_OTLP_PROTOCOL.equals(protocol.trim().toLowerCase(Locale.ROOT))) {
                System.setProperty(TRACING_EXPORTER_TYPE_PROPERTY, "GRPC");
            } else if ("http/protobuf".equals(protocol.trim().toLowerCase(Locale.ROOT))) {
                System.setProperty(TRACING_EXPORTER_TYPE_PROPERTY, "HTTP_PROTO");
            }
        }

        copyIfPresent(environment, "OTEL_BSP_MAX_QUEUE_SIZE", TRACING_MAX_QUEUE_SIZE_PROPERTY);
        copyIfPresent(environment, "OTEL_BSP_MAX_EXPORT_BATCH_SIZE", TRACING_MAX_EXPORT_BATCH_SIZE_PROPERTY);
        copyMillisDurationIfPresent(environment, "OTEL_BSP_SCHEDULE_DELAY", TRACING_SCHEDULE_DELAY_PROPERTY);
        copyMillisDurationIfPresent(environment, "OTEL_BSP_EXPORT_TIMEOUT", TRACING_EXPORT_TIMEOUT_PROPERTY);
        copyIfPresent(environment, "OTEL_SERVICE_NAME", TRACING_SERVICE_PROPERTY);
    }

    private static void copyIfPresent(Map<String, String> environment, String envName, String propertyName) {
        String envValue = environment.get(envName);
        if (!isBlank(envValue) && isBlank(System.getProperty(propertyName))) {
            System.setProperty(propertyName, envValue.trim());
        }
    }

    private static void copyMillisDurationIfPresent(Map<String, String> environment,
                                                    String envName,
                                                    String propertyName) {
        String envValue = environment.get(envName);
        if (isBlank(envValue) || !isBlank(System.getProperty(propertyName))) {
            return;
        }

        try {
            System.setProperty(propertyName, Duration.ofMillis(Long.parseLong(envValue.trim())).toString());
        } catch (NumberFormatException e) {
            log.warn("Ignoring invalid millisecond duration '{}' from {}", envValue, envName, e);
        }
    }

    private static void configureHelidonTracingEndpoint(String endpoint) {
        try {
            URI endpointUri = new URI(endpoint.trim());
            if (!isBlank(endpointUri.getScheme()) && isBlank(System.getProperty(TRACING_PROTOCOL_PROPERTY))) {
                System.setProperty(TRACING_PROTOCOL_PROPERTY, endpointUri.getScheme());
            }
            if (!isBlank(endpointUri.getHost()) && isBlank(System.getProperty(TRACING_HOST_PROPERTY))) {
                System.setProperty(TRACING_HOST_PROPERTY, endpointUri.getHost());
            }
            if (endpointUri.getPort() > 0 && isBlank(System.getProperty(TRACING_PORT_PROPERTY))) {
                System.setProperty(TRACING_PORT_PROPERTY, Integer.toString(endpointUri.getPort()));
            }
            String path = endpointUri.getPath();
            if (!isBlank(path) && !"/".equals(path) && isBlank(System.getProperty(TRACING_PATH_PROPERTY))) {
                System.setProperty(TRACING_PATH_PROPERTY, path);
            }
        } catch (URISyntaxException e) {
            log.warn("Ignoring invalid OTEL exporter endpoint '{}' for Helidon tracing config", endpoint, e);
        }
    }

    static void configureGrpcSenderProvider() {
        List<String> grpcSignals = OTLP_SIGNALS.stream()
                .filter(signal -> DEFAULT_OTLP_PROTOCOL.equals(resolveProtocol(signal)))
                .toList();

        if (grpcSignals.isEmpty()) {
            log.info("OTLP protocols do not use gRPC sender selection: traces={}, metrics={}, logs={}",
                    resolveProtocol("traces"),
                    resolveProtocol("metrics"),
                    resolveProtocol("logs"));
            return;
        }

        if (System.getProperty(GRPC_SENDER_PROVIDER_PROPERTY) == null
                || System.getProperty(GRPC_SENDER_PROVIDER_PROPERTY).isBlank()) {
            System.setProperty(GRPC_SENDER_PROVIDER_PROPERTY, OKHTTP_GRPC_SENDER_PROVIDER);
        }

        List<String> discoveredProviders = discoverGrpcSenderProviders();
        String selectedProvider = System.getProperty(GRPC_SENDER_PROVIDER_PROPERTY);

        log.info("OTLP protocols: traces={}, metrics={}, logs={}",
                resolveProtocol("traces"),
                resolveProtocol("metrics"),
                resolveProtocol("logs"));
        log.info("Selected OTel gRPC sender provider: {}", selectedProvider);
        log.info("Discovered OTel gRPC sender providers: {}", discoveredProviders);

        if (!discoveredProviders.contains(selectedProvider)) {
            log.warn("Configured OTel gRPC sender provider '{}' is not discoverable on the classpath",
                    selectedProvider);
        }

        if (discoveredProviders.size() > 1) {
            log.warn("Multiple OTel gRPC sender providers discovered for signals {}: {}. Using {}",
                    grpcSignals,
                    discoveredProviders,
                    selectedProvider);
        }
    }

    static String resolveProtocol(String signal) {
        String signalProperty = System.getProperty("otel.exporter.otlp." + signal + ".protocol");
        if (signalProperty != null && !signalProperty.isBlank()) {
            return signalProperty.trim().toLowerCase(Locale.ROOT);
        }

        String signalEnv = System.getenv("OTEL_EXPORTER_OTLP_" + signal.toUpperCase(Locale.ROOT) + "_PROTOCOL");
        if (signalEnv != null && !signalEnv.isBlank()) {
            return signalEnv.trim().toLowerCase(Locale.ROOT);
        }

        String globalProperty = System.getProperty(OTLP_PROTOCOL_PROPERTY);
        if (globalProperty != null && !globalProperty.isBlank()) {
            return globalProperty.trim().toLowerCase(Locale.ROOT);
        }

        String globalEnv = System.getenv(OTLP_PROTOCOL_ENV);
        if (globalEnv != null && !globalEnv.isBlank()) {
            return globalEnv.trim().toLowerCase(Locale.ROOT);
        }

        return DEFAULT_OTLP_PROTOCOL;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String firstNonBlank(String first, String second) {
        if (!isBlank(first)) {
            return first;
        }
        if (!isBlank(second)) {
            return second;
        }
        return null;
    }

    static List<String> discoverGrpcSenderProviders() {
        return ServiceLoader.load(GrpcSenderProvider.class)
                .stream()
                .map(provider -> provider.type().getName())
                .sorted()
                .toList();
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