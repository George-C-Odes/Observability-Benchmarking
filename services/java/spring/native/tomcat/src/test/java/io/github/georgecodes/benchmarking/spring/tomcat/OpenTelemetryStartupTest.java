package io.github.georgecodes.benchmarking.spring.tomcat;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.spring.autoconfigure.OpenTelemetryAutoConfiguration;
import io.opentelemetry.sdk.autoconfigure.AutoConfiguredOpenTelemetrySdk;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the native module's OpenTelemetry starter and SDK can initialize together.
 */
class OpenTelemetryStartupTest {

    @Test
    void testInitializesSdkWithSpringResourceProperties() {
        new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OpenTelemetryAutoConfiguration.class))
            .withPropertyValues(
                "otel.service.name=SpringNativeTomcat",
                "otel.resource.attributes=benchmark.variant=platform",
                "otel.traces.exporter=none",
                "otel.metrics.exporter=none",
                "otel.logs.exporter=none")
            .run(context -> {
                assertThat(context)
                    .as("OpenTelemetry auto-configuration starts successfully")
                    .hasNotFailed();
                assertThat(context)
                    .as("The context provides one OpenTelemetry bean")
                    .hasSingleBean(OpenTelemetry.class);
                assertThat(context)
                    .as("The context provides one auto-configured OpenTelemetry SDK bean")
                    .hasSingleBean(AutoConfiguredOpenTelemetrySdk.class);
                assertThat(context.getBean(AutoConfiguredOpenTelemetrySdk.class).getOpenTelemetrySdk())
                    .as("The auto-configured OpenTelemetry SDK is initialized")
                    .isNotNull();
            });
    }
}
