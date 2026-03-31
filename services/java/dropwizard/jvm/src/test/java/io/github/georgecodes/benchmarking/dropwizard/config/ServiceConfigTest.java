package io.github.georgecodes.benchmarking.dropwizard.config;

import io.github.georgecodes.benchmarking.dropwizard.config.ServiceConfig.ThreadMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Unit tests for {@link ServiceConfig} and its nested enums.
 */
class ServiceConfigTest {

    // ── ThreadMode ──────────────────────────────────────────────────────

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "\t"})
    void threadModeDefaultsToPlatform(String input) {
        assertEquals(ThreadMode.PLATFORM, ThreadMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"virtual", "vthread", "vthreads", "vt", "VIRTUAL", " vt "})
    void threadModeVirtualVariants(String input) {
        assertEquals(ThreadMode.VIRTUAL, ThreadMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"platform", "thread", "threads", "pt", "PLATFORM", " pt "})
    void threadModePlatformVariants(String input) {
        assertEquals(ThreadMode.PLATFORM, ThreadMode.fromEnv(input));
    }

    @Test
    void threadModeRejectsInvalid() {
        assertThrows(IllegalArgumentException.class, () -> ThreadMode.fromEnv("bogus"));
    }

    // ── Record construction ─────────────────────────────────────────────

    @Test
    void recordFieldsAreAccessible() {
        ServiceConfig config = new ServiceConfig(
            9090,
            ThreadMode.VIRTUAL,
            200,
            32, 4, 5000, 30000L
        );

        assertEquals(9090, config.port());
        assertEquals(ThreadMode.VIRTUAL, config.threadMode());
        assertEquals(200, config.cacheSize());
        assertEquals(32, config.jettyMaxThreads());
        assertEquals(4, config.jettyMinThreads());
        assertEquals(5000, config.jettyAcceptQueueSize());
        assertEquals(30000L, config.jettyIdleTimeoutMs());
    }

    @Test
    void fromEnvironmentReturnsDefaults() {
        // Only assert concrete defaults when the env vars are absent;
        // skip gracefully in CI / developer shells that set them.
        assumeTrue(System.getenv("SERVICE_PORT") == null,
            "SERVICE_PORT is set — skipping defaults assertion");
        assumeTrue(System.getenv("CACHE_SIZE") == null,
            "CACHE_SIZE is set — skipping defaults assertion");
        assumeTrue(System.getenv("THREAD_MODE") == null,
            "THREAD_MODE is set — skipping defaults assertion");

        ServiceConfig config = ServiceConfig.fromEnvironment();
        assertEquals(8080, config.port());
        assertEquals(ThreadMode.PLATFORM, config.threadMode());
        assertEquals(50000L, config.cacheSize());
    }

    @Test
    void defaultValues() {
        ServiceConfig config = new ServiceConfig(
            8080,
            ThreadMode.PLATFORM,
            50000,
            0, 0, 10000, 60000L
        );
        assertEquals(8080, config.port());
        assertEquals(ThreadMode.PLATFORM, config.threadMode());
        assertEquals(50000, config.cacheSize());
        assertEquals(0, config.jettyMaxThreads());
        assertEquals(0, config.jettyMinThreads());
        assertEquals(10000, config.jettyAcceptQueueSize());
        assertEquals(60000L, config.jettyIdleTimeoutMs());
    }
}