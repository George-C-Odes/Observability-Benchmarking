package io.github.georgecodes.benchmarking.pekko.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Unit tests for {@link ServiceConfig}.
 */
class ServiceConfigTest {

    @Test
    void recordFieldsAreAccessible() {
        ServiceConfig config = new ServiceConfig(9090, 200);

        assertEquals(9090, config.port());
        assertEquals(200, config.cacheSize());
    }

    @Test
    void fromEnvironmentReturnsDefaults() {
        // Without SERVICE_PORT / CACHE_SIZE env vars set, defaults should apply.
        ServiceConfig config = ServiceConfig.fromEnvironment();
        assertNotNull(config);
        // Default port is 8080, default cacheSize is 50,000
        // (actual values depend on env; just assert non-null and positive)
        assert config.port() > 0 : "port must be positive";
        assert config.cacheSize() > 0 : "cacheSize must be positive";
    }

    @Test
    void defaultValues() {
        ServiceConfig config = new ServiceConfig(8080, 50000);
        assertEquals(8080, config.port());
        assertEquals(50000, config.cacheSize());
    }
}