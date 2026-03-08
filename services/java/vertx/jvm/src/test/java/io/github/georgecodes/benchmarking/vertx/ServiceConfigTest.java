package io.github.georgecodes.benchmarking.vertx;

import io.github.georgecodes.benchmarking.vertx.config.ServiceConfig;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}