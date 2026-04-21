package io.github.georgecodes.benchmarking.helidon.mp.infra;

import ch.qos.logback.classic.Logger;
import io.github.georgecodes.benchmarking.helidon.mp.application.port.HelloMode;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.GlobalOpenTelemetry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class StartupListenerTest {

    @BeforeEach
    @AfterEach
    void cleanUp() {
        Metrics.globalRegistry.getMeters().forEach(Metrics.globalRegistry::remove);
        rootLogger().detachAppender("OTEL");
    }

    @Test
    void onStartupWarmsKnownEndpointMetrics() throws Exception {
        StartupListener listener = new StartupListener();
        setField(listener, "openTelemetry", GlobalOpenTelemetry.get());
        setField(listener, "metricsAdapter", new MicrometerMetricsAdapter());

        listener.onStartup(new Object());

        Counter counter = Metrics.globalRegistry.find("hello.request.count")
                .tag("endpoint", HelloMode.VIRTUAL.endpointTag())
                .counter();
        assertNotNull(counter);
    }

    @Test
    void attachAppenderProgrammaticallyAddsRootAppender() throws Exception {
        Method method = StartupListener.class.getDeclaredMethod("attachAppenderProgrammatically", Class.class);
        method.setAccessible(true);

        rootLogger().detachAppender("OTEL");
        method.invoke(null, Class.forName(
                "io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender"));

        assertNotNull(rootLogger().getAppender("OTEL"));
    }

    @Test
    void attachAppenderProgrammaticallyHandlesUnexpectedClasses() throws Exception {
        Method method = StartupListener.class.getDeclaredMethod("attachAppenderProgrammatically", Class.class);
        method.setAccessible(true);

        method.invoke(null, String.class);
    }

    @Test
    void isNativeImageReturnsFalseOnJvm() throws Exception {
        Method method = StartupListener.class.getDeclaredMethod("isNativeImage");
        method.setAccessible(true);

        boolean nativeImage = (boolean) method.invoke(null);

        assertFalse(nativeImage);
    }

    private static Logger rootLogger() {
        return (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    }

    private static void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }
}
