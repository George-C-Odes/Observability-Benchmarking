package io.github.georgecodes.benchmarking.vertx.config;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Unit tests for {@link ServiceConfig}.
 */
class ServiceConfigTest {

    @Test
    void recordFieldsAreAccessible() {
        ServiceConfig config = new ServiceConfig(9090, 200, 8);

        assertEquals(9090, config.port());
        assertEquals(200, config.cacheSize());
        assertEquals(8, config.eventLoopSize());
    }

    @Test
    void resolvedEventLoopSizeReturnsExplicitValue() {
        ServiceConfig config = new ServiceConfig(8080, 50000, 6);
        assertEquals(6, config.resolvedEventLoopSize());
    }

    @Test
    void resolvedEventLoopSizeComputesDefault() {
        ServiceConfig config = new ServiceConfig(8080, 50000, 0);
        int expected = Math.max(2, Runtime.getRuntime().availableProcessors() * 2);
        assertEquals(expected, config.resolvedEventLoopSize());
    }

    @Test
    void resolvedEventLoopSizeFallsBackForNegativeValue() {
        ServiceConfig config = new ServiceConfig(8080, 50000, -1);
        int expected = Math.max(2, Runtime.getRuntime().availableProcessors() * 2);
        assertEquals(expected, config.resolvedEventLoopSize());
    }

    @Test
    void fromEnvironmentUsesDefaultsForMissingAndBlankValues() {
        ServiceConfig config = ServiceConfig.fromEnvironment(key -> switch (key) {
            case "SERVICE_PORT" -> "   ";
            case "CACHE_SIZE" -> null;
            case "VERTX_EVENT_LOOP_SIZE" -> "";
            default -> throw new IllegalArgumentException("Unexpected key: " + key);
        });

        assertEquals(8080, config.port());
        assertEquals(50000L, config.cacheSize());
        assertEquals(0, config.eventLoopSize());
    }

    @Test
    void fromEnvironmentTrimsAndParsesNumericValues() {
        Map<String, String> environment = Map.of(
            "SERVICE_PORT", " 9091 ",
            "CACHE_SIZE", " 123456 ",
            "VERTX_EVENT_LOOP_SIZE", " 12 "
        );

        ServiceConfig config = ServiceConfig.fromEnvironment(environment::get);

        assertEquals(9091, config.port());
        assertEquals(123456L, config.cacheSize());
        assertEquals(12, config.eventLoopSize());
    }

    @Test
    void fromEnvironmentRejectsInvalidNumericValues() {
        Function<String, String> environmentProvider = key -> switch (key) {
            case "SERVICE_PORT" -> "not-a-number";
            case "CACHE_SIZE" -> "50000";
            case "VERTX_EVENT_LOOP_SIZE" -> "2";
            default -> throw new IllegalArgumentException("Unexpected key: " + key);
        };

        assertThrows(NumberFormatException.class, () -> ServiceConfig.fromEnvironment(environmentProvider));
    }

    @Test
    void fromEnvironmentRejectsNullEnvironmentProvider() {
        assertThrows(NullPointerException.class, () -> ServiceConfig.fromEnvironment(null));
    }
}
