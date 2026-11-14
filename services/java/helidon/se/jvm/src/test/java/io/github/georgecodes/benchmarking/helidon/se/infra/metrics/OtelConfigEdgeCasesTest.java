package io.github.georgecodes.benchmarking.helidon.se.infra.metrics;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class OtelConfigEdgeCasesTest {
    private Properties originalProperties;

    @BeforeEach
    void saveProperties() {
        originalProperties = (Properties) System.getProperties().clone();
        System.getProperties().keySet().removeIf(key -> key.toString().startsWith("otel.")
                || key.toString().startsWith("tracing.")
                || key.equals(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY));
    }

    @AfterEach
    void restoreProperties() {
        System.setProperties(originalProperties);
    }

    @Test
    void blankEnvironmentValuesAreIgnoredAndBlankPropertiesCanBeReplaced() {
        System.setProperty(OtelConfig.OTLP_ENDPOINT_PROPERTY, " ");
        OtelConfig.configureAutoconfigureSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, " http://collector:4317 ",
                OtelConfig.OTLP_PROTOCOL_ENV, " "));

        assertEquals("http://collector:4317", System.getProperty(OtelConfig.OTLP_ENDPOINT_PROPERTY));
        assertNull(System.getProperty(OtelConfig.OTLP_PROTOCOL_PROPERTY));
    }

    @Test
    void environmentEndpointIsUsedWhenSystemEndpointIsBlank() {
        System.setProperty(OtelConfig.OTLP_ENDPOINT_PROPERTY, " ");
        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, " https://collector:4318/v1/traces ",
                OtelConfig.OTLP_PROTOCOL_ENV, " HTTP/PROTOBUF "));

        assertEquals("https", System.getProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY));
        assertEquals("collector", System.getProperty(OtelConfig.TRACING_HOST_PROPERTY));
        assertEquals("4318", System.getProperty(OtelConfig.TRACING_PORT_PROPERTY));
        assertEquals("/v1/traces", System.getProperty(OtelConfig.TRACING_PATH_PROPERTY));
        assertEquals("HTTP_PROTO", System.getProperty(OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY));
    }

    @Test
    void explicitTracingSettingsWinOverEnvironment() {
        Map<String, String> explicit = Map.of(
                OtelConfig.TRACING_PROTOCOL_PROPERTY, "https",
                OtelConfig.TRACING_HOST_PROPERTY, "explicit",
                OtelConfig.TRACING_PORT_PROPERTY, "443",
                OtelConfig.TRACING_PATH_PROPERTY, "/custom",
                OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY, "GRPC",
                OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY, "PT2S",
                OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY, "PT3S");
        explicit.forEach(System::setProperty);

        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, "http://collector:4317/v1/traces",
                "OTEL_BSP_SCHEDULE_DELAY", "1000",
                "OTEL_BSP_EXPORT_TIMEOUT", "1000"));

        explicit.forEach((key, value) -> assertEquals(value, System.getProperty(key), key));
    }

    @Test
    void missingAndRelativeEndpointComponentsDoNotCreateInvalidTracingSettings() {
        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, "/v1/traces"));
        assertNull(System.getProperty(OtelConfig.TRACING_PROTOCOL_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_HOST_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_PORT_PROPERTY));
        assertEquals("/v1/traces", System.getProperty(OtelConfig.TRACING_PATH_PROPERTY));
    }

    @Test
    void rootEndpointPathIsIgnored() {
        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, "http://collector/"));
        assertNull(System.getProperty(OtelConfig.TRACING_PATH_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_PORT_PROPERTY));
    }

    @Test
    void invalidEndpointAndDurationsAreIgnoredWithoutBlockingOtherSettings() {
        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_ENDPOINT_ENV, "http://bad host:4317",
                "OTEL_BSP_SCHEDULE_DELAY", "not-a-number",
                "OTEL_BSP_EXPORT_TIMEOUT", "9223372036854775808",
                "OTEL_SERVICE_NAME", "test-service"));

        assertNull(System.getProperty(OtelConfig.TRACING_HOST_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY));
        assertEquals("test-service", System.getProperty(OtelConfig.TRACING_SERVICE_PROPERTY));
    }

    @Test
    void blankDurationsAndUnknownProtocolLeavePropertiesUnset() {
        OtelConfig.configureHelidonTracingSystemProperties(Map.of(
                OtelConfig.OTLP_PROTOCOL_ENV, "unknown",
                "OTEL_BSP_SCHEDULE_DELAY", " ",
                "OTEL_BSP_EXPORT_TIMEOUT", " "));
        assertNull(System.getProperty(OtelConfig.TRACING_EXPORTER_TYPE_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_SCHEDULE_DELAY_PROPERTY));
        assertNull(System.getProperty(OtelConfig.TRACING_EXPORT_TIMEOUT_PROPERTY));
    }

    @Test
    void httpOnlySignalsDoNotSelectGrpcSender() {
        System.setProperty(OtelConfig.OTLP_PROTOCOL_PROPERTY, " HTTP/PROTOBUF ");
        OtelConfig.configureGrpcSenderProvider();
        assertNull(System.getProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY));
        assertEquals("http/protobuf", OtelConfig.resolveProtocol("traces"));
    }

    @Test
    void explicitSenderIsPreservedEvenWhenUnavailable() {
        System.setProperty(OtelConfig.OTLP_PROTOCOL_PROPERTY, "grpc");
        System.setProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY, "custom.Provider");
        OtelConfig.configureGrpcSenderProvider();
        assertEquals("custom.Provider", System.getProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY));
    }

    @Test
    void blankSenderFallsBackToOkHttpAndBlankSignalProtocolFallsBackToGlobal() {
        System.setProperty(OtelConfig.OTLP_PROTOCOL_PROPERTY, " GRPC ");
        System.setProperty("otel.exporter.otlp.traces.protocol", " ");
        System.setProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY, " ");

        OtelConfig.configureGrpcSenderProvider();

        assertEquals("grpc", OtelConfig.resolveProtocol("traces"));
        assertEquals(OtelConfig.OKHTTP_GRPC_SENDER_PROVIDER,
                System.getProperty(OtelConfig.GRPC_SENDER_PROVIDER_PROPERTY));
    }

    @Test
    void blankGlobalProtocolFallsBackToDefault() {
        String environmentProtocol = System.getenv(OtelConfig.OTLP_PROTOCOL_ENV);
        String signalProtocol = System.getenv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL");
        org.junit.jupiter.api.Assumptions.assumeTrue(environmentProtocol == null || environmentProtocol.isBlank());
        org.junit.jupiter.api.Assumptions.assumeTrue(signalProtocol == null || signalProtocol.isBlank());
        System.setProperty(OtelConfig.OTLP_PROTOCOL_PROPERTY, " ");

        assertEquals(OtelConfig.DEFAULT_OTLP_PROTOCOL, OtelConfig.resolveProtocol("traces"));
    }
}
