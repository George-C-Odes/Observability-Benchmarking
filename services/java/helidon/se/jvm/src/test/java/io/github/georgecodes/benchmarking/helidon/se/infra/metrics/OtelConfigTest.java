package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class OtelConfigTest {

    private static final String OTLP_PROTOCOL_PROPERTY = "otel.exporter.otlp.protocol";
    private static final String OTLP_ENDPOINT_PROPERTY = "otel.exporter.otlp.endpoint";
    private static final String METRICS_PROTOCOL_PROPERTY = "otel.exporter.otlp.metrics.protocol";

    @BeforeEach
    void resetGlobalOpenTelemetry() {
        GlobalOpenTelemetry.resetForTest();
        System.clearProperty(OTLP_ENDPOINT_PROPERTY);
        System.clearProperty(OTLP_PROTOCOL_PROPERTY);
        System.clearProperty(METRICS_PROTOCOL_PROPERTY);
        System.clearProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_HOST_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PORT_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PATH_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_SERVICE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_MAX_QUEUE_SIZE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_MAX_EXPORT_BATCH_SIZE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY);
    }

    @AfterEach
    void clearAddedRegistries() {
        new ArrayList<>(Metrics.globalRegistry.getRegistries()).forEach(Metrics.globalRegistry::remove);
        GlobalOpenTelemetry.resetForTest();
        System.clearProperty(OTLP_ENDPOINT_PROPERTY);
        System.clearProperty(OTLP_PROTOCOL_PROPERTY);
        System.clearProperty(METRICS_PROTOCOL_PROPERTY);
        System.clearProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_HOST_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PORT_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_PATH_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_SERVICE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_MAX_QUEUE_SIZE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_MAX_EXPORT_BATCH_SIZE_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY);
        System.clearProperty(OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY);
    }

    @Test
    void resolveProtocolDefaultsToGrpcAndSupportsSignalSpecificOverride() {
        assertNotNull(OtelConfig.resolveProtocol("traces"));
        assertFalse(OtelConfig.resolveProtocol("traces").isBlank());

        System.setProperty(OTLP_PROTOCOL_PROPERTY, "http/protobuf");
        System.setProperty(METRICS_PROTOCOL_PROPERTY, "grpc");

        Assertions.assertEquals("http/protobuf", OtelConfig.resolveProtocol("traces"));
        Assertions.assertEquals("grpc", OtelConfig.resolveProtocol("metrics"));
    }

    @Test
    void configureGrpcSenderProviderPinsOkHttpProvider() {
        OtelConfig.configureGrpcSenderProvider();

        Assertions.assertEquals(
                OtelConfig.OKHTTP_GRPC_SENDER_PROVIDER,
                System.getProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY));
        Assertions.assertTrue(
                OtelConfig.discoverGrpcSenderProviders().contains(OtelConfig.OKHTTP_GRPC_SENDER_PROVIDER));
    }

    @Test
    void configureAutoconfigureSystemPropertiesCopiesOtelEnvironmentWithoutOverridingProperties() {
        System.setProperty(OTLP_PROTOCOL_PROPERTY, "http/protobuf");

        OtelConfig.configureAutoconfigureSystemProperties(Map.of(
                "OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4317",
                "OTEL_EXPORTER_OTLP_PROTOCOL", "grpc"));

        Assertions.assertEquals(
                "http://alloy:4317",
                System.getProperty(OTLP_ENDPOINT_PROPERTY));
        Assertions.assertEquals(
                "http/protobuf",
                System.getProperty(OTLP_PROTOCOL_PROPERTY));
    }

    @Test
    void configureSystemPropertiesFromEnvironmentCopiesOtelEndpointToHelidonTracingProperties() {
        OtelConfig.configureSystemPropertiesFromEnvironment(Map.of(
                "OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4317",
                "OTEL_EXPORTER_OTLP_PROTOCOL", "grpc",
                "OTEL_SERVICE_NAME", "helidon-se-native",
                "OTEL_BSP_MAX_QUEUE_SIZE", "65536",
                "OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "4096",
                "OTEL_BSP_SCHEDULE_DELAY", "1000",
                "OTEL_BSP_EXPORT_TIMEOUT", "10000"));

        Assertions.assertEquals("http", System.getProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY));
        Assertions.assertEquals("alloy", System.getProperty(OtelConfig.TRACING_HOST_PROPERTY));
        Assertions.assertEquals("4317", System.getProperty(OtelConfig.TRACING_PORT_PROPERTY));
        Assertions.assertEquals("helidon-se-native", System.getProperty(OtelConfig.TRACING_SERVICE_PROPERTY));
        Assertions.assertEquals("GRPC", System.getProperty(OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY));
        Assertions.assertEquals("65536", System.getProperty(OtelConfig.TRACING_MAX_QUEUE_SIZE_PROPERTY));
        Assertions.assertEquals("4096", System.getProperty(OtelConfig.TRACING_MAX_EXPORT_BATCH_SIZE_PROPERTY));
        Assertions.assertEquals("PT1S", System.getProperty(OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY));
        Assertions.assertEquals("PT10S", System.getProperty(OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY));
    }

    @Test
    void configureSystemPropertiesFromEnvironmentDoesNotOverrideExplicitHelidonTracingProperties() {
        System.setProperty(OtelConfig.TRACING_HOST_PROPERTY, "explicit-host");
        System.setProperty(OtelConfig.TRACING_PORT_PROPERTY, "9999");
        System.setProperty(OtelConfig.TRACING_SERVICE_PROPERTY, "explicit-service");

        OtelConfig.configureSystemPropertiesFromEnvironment(Map.of(
                "OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy:4317",
                "OTEL_SERVICE_NAME", "helidon-se-native"));

        Assertions.assertEquals("explicit-host", System.getProperty(OtelConfig.TRACING_HOST_PROPERTY));
        Assertions.assertEquals("9999", System.getProperty(OtelConfig.TRACING_PORT_PROPERTY));
        Assertions.assertEquals("explicit-service", System.getProperty(OtelConfig.TRACING_SERVICE_PROPERTY));
        Assertions.assertEquals("http", System.getProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY));
    }

    @Test
    void initializeCreatesOpenTelemetryAndBridgeRegistersMeterRegistry() {
        List<MeterRegistry> before = new ArrayList<>(Metrics.globalRegistry.getRegistries());

        OpenTelemetry openTelemetry = OtelConfig.initialize();
        OtelConfig.bridgeMicrometer(openTelemetry);

        List<MeterRegistry> after = new ArrayList<>(Metrics.globalRegistry.getRegistries());

        assertNotNull(openTelemetry);
        after.removeAll(before);
        assertFalse(after.isEmpty());
    }
}
