package io.github.georgecodes.benchmarking.pekko.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

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
        // Only assert concrete defaults when the env vars are absent;
        // skip gracefully in CI / developer shells that set them.
        assumeTrue(System.getenv("SERVICE_PORT") == null,
            "SERVICE_PORT is set — skipping defaults assertion");
        assumeTrue(System.getenv("CACHE_SIZE") == null,
            "CACHE_SIZE is set — skipping defaults assertion");

        ServiceConfig config = ServiceConfig.fromEnvironment();
        assertEquals(8080, config.port());
        assertEquals(50000, config.cacheSize());
    }

    @Test
    void defaultValues() {
        ServiceConfig config = new ServiceConfig(8080, 50000);
        assertEquals(8080, config.port());
        assertEquals(50000, config.cacheSize());
    }
}