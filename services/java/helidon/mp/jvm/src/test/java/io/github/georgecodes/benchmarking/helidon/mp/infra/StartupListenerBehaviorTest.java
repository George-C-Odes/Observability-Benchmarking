package io.github.georgecodes.benchmarking.helidon.mp.infra;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import io.github.georgecodes.benchmarking.helidon.mp.infra.metrics.MicrometerMetricsAdapter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Metrics;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class StartupListenerBehaviorTest {
    private static final String BSP_LOGGER = "io.opentelemetry.sdk.trace.export.BatchSpanProcessor";
    private Properties properties;
    private Level loggerLevel;
    private Level workerLevel;
    private List<MeterRegistry> registries;
    private boolean bridged;

    @BeforeEach
    void saveState() throws Exception {
        properties = (Properties) System.getProperties().clone();
        loggerLevel = logger(BSP_LOGGER).getLevel();
        workerLevel = logger(BSP_LOGGER + "$Worker").getLevel();
        registries = new ArrayList<>(Metrics.globalRegistry.getRegistries());
        bridged = bridgedFlag().getAndSet(false);
        System.clearProperty("OTEL_BSP_LOG_LEVEL");
        System.clearProperty("otel.bsp.log.level");
    }

    @AfterEach
    void restoreState() throws Exception {
        System.setProperties(properties);
        logger(BSP_LOGGER).setLevel(loggerLevel);
        logger(BSP_LOGGER + "$Worker").setLevel(workerLevel);
        for (MeterRegistry registry : new ArrayList<>(Metrics.globalRegistry.getRegistries())) {
            if (!registries.contains(registry)) {
                Metrics.globalRegistry.remove(registry);
                registry.close();
            }
        }
        bridgedFlag().set(bridged);
    }

    @Test
    void repeatedStartupBridgesOnlyOnceAndKeepsExistingAppender() {
        StartupListener listener = listener();
        var root = logger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        var existing = root.getAppender("OTEL");

        listener.onStartup(new Object());
        int registryCount = Metrics.globalRegistry.getRegistries().size();
        var appender = root.getAppender("OTEL");
        listener.onStartup(new Object());

        assertEquals(registries.size() + 1, registryCount);
        assertEquals(registryCount, Metrics.globalRegistry.getRegistries().size());
        assertSame(appender, root.getAppender("OTEL"));
        if (existing != null) {
            assertSame(existing, appender);
        }
    }

    @Test
    void startupCreatesMissingOtelAppender() {
        var root = logger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        var existing = root.getAppender("OTEL");
        root.detachAppender("OTEL");
        try {
            listener().onStartup(new Object());

            var installed = assertInstanceOf(OpenTelemetryAppender.class, root.getAppender("OTEL"));
            assertTrue(installed.isStarted());
            assertSame(root.getLoggerContext(), installed.getContext());
        } finally {
            var installed = root.getAppender("OTEL");
            root.detachAppender("OTEL");
            if (installed != null) {
                installed.stop();
            }
            if (existing != null) {
                root.addAppender(existing);
            }
        }
    }

    @Test
    void uppercasePropertyOverridesDottedProperty() {
        assumeNoEnvironmentOverride();
        System.setProperty("OTEL_BSP_LOG_LEVEL", "ERROR");
        System.setProperty("otel.bsp.log.level", "OFF");
        listener().onStartup(new Object());
        assertBspLevel(Level.ERROR);
    }

    @Test
    void blankUppercasePropertyFallsBackToDottedProperty() {
        assumeNoEnvironmentOverride();
        System.setProperty("OTEL_BSP_LOG_LEVEL", " ");
        System.setProperty("otel.bsp.log.level", "OFF");
        listener().onStartup(new Object());
        assertBspLevel(Level.OFF);
    }

    @Test
    void blankPropertiesUseWarnDefault() {
        assumeNoEnvironmentOverride();
        System.setProperty("OTEL_BSP_LOG_LEVEL", " ");
        System.setProperty("otel.bsp.log.level", " ");
        listener().onStartup(new Object());
        assertBspLevel(Level.WARN);
    }

    @Test
    void unknownLogLevelUsesWarnDefault() {
        assumeNoEnvironmentOverride();
        System.setProperty("OTEL_BSP_LOG_LEVEL", "not-a-level");
        listener().onStartup(new Object());
        assertBspLevel(Level.WARN);
    }

    private static void assumeNoEnvironmentOverride() {
        String value = System.getenv("OTEL_BSP_LOG_LEVEL");
        assumeTrue(value == null || value.isBlank(), "Environment overrides property-based log levels");
    }

    private static void assertBspLevel(Level expected) {
        assertEquals(expected, logger(BSP_LOGGER).getLevel());
        assertEquals(expected, logger(BSP_LOGGER + "$Worker").getLevel());
    }

    private static StartupListener listener() {
        return new StartupListener(OpenTelemetry.noop(), new MicrometerMetricsAdapter());
    }

    private static Logger logger(String name) {
        return (Logger) LoggerFactory.getLogger(name);
    }

    private static AtomicBoolean bridgedFlag() throws Exception {
        Field field = StartupListener.class.getDeclaredField("MICROMETER_BRIDGED");
        field.setAccessible(true);
        return (AtomicBoolean) field.get(null);
    }
}
