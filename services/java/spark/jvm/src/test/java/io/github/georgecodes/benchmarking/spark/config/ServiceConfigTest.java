package io.github.georgecodes.benchmarking.spark.config;

import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.HandlerExecutionMode;
import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.ThreadMode;
import io.github.georgecodes.benchmarking.spark.config.ServiceConfig.VirtualExecutionMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
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

    // ── HandlerExecutionMode ────────────────────────────────────────────

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  "})
    void handlerModeDefaultsToDirect(String input) {
        assertEquals(HandlerExecutionMode.DIRECT, HandlerExecutionMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"direct", "DIRECT", " direct "})
    void handlerModeDirect(String input) {
        assertEquals(HandlerExecutionMode.DIRECT, HandlerExecutionMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"offload", "executor", "OFFLOAD", " executor "})
    void handlerModeOffload(String input) {
        assertEquals(HandlerExecutionMode.OFFLOAD, HandlerExecutionMode.fromEnv(input));
    }

    @Test
    void handlerModeRejectsInvalid() {
        assertThrows(IllegalArgumentException.class, () -> HandlerExecutionMode.fromEnv("bogus"));
    }

    // ── VirtualExecutionMode ────────────────────────────────────────────

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  "})
    void virtualModeDefaultsToSpark(String input) {
        assertEquals(VirtualExecutionMode.SPARK, VirtualExecutionMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"spark", "SPARK", " spark "})
    void virtualModeSpark(String input) {
        assertEquals(VirtualExecutionMode.SPARK, VirtualExecutionMode.fromEnv(input));
    }

    @ParameterizedTest
    @ValueSource(strings = {"offload", "executor", "OFFLOAD", " executor "})
    void virtualModeOffload(String input) {
        assertEquals(VirtualExecutionMode.OFFLOAD, VirtualExecutionMode.fromEnv(input));
    }

    @Test
    void virtualModeRejectsInvalid() {
        assertThrows(IllegalArgumentException.class, () -> VirtualExecutionMode.fromEnv("bogus"));
    }

    // ── Record construction ─────────────────────────────────────────────

    @Test
    void recordFieldsAreAccessible() {
        ServiceConfig config = new ServiceConfig(
            9090,
            ThreadMode.VIRTUAL,
            200,
            32, 4, 5000, 30000L,
            HandlerExecutionMode.OFFLOAD,
            16,
            VirtualExecutionMode.OFFLOAD
        );

        assertEquals(9090, config.port());
        assertEquals(ThreadMode.VIRTUAL, config.threadMode());
        assertEquals(200, config.cacheSize());
        assertEquals(32, config.jettyMaxThreads());
        assertEquals(4, config.jettyMinThreads());
        assertEquals(5000, config.jettyAcceptQueueSize());
        assertEquals(30000L, config.jettyIdleTimeoutMs());
        assertEquals(HandlerExecutionMode.OFFLOAD, config.handlerExecutionMode());
        assertEquals(16, config.platformExecutorThreads());
        assertEquals(VirtualExecutionMode.OFFLOAD, config.virtualExecutionMode());
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
            0, 0, 10000, 60000L,
            HandlerExecutionMode.DIRECT,
            0,
            VirtualExecutionMode.SPARK
        );
        assertEquals(8080, config.port());
        assertEquals(ThreadMode.PLATFORM, config.threadMode());
        assertEquals(50000, config.cacheSize());
        assertEquals(0, config.jettyMaxThreads());
        assertEquals(0, config.jettyMinThreads());
        assertEquals(10000, config.jettyAcceptQueueSize());
        assertEquals(60000L, config.jettyIdleTimeoutMs());
        assertEquals(HandlerExecutionMode.DIRECT, config.handlerExecutionMode());
        assertEquals(0, config.platformExecutorThreads());
        assertEquals(VirtualExecutionMode.SPARK, config.virtualExecutionMode());
    }

    @Test
    void parseIntReturnsDefaultForNullAndBlank() throws Exception {
        Method method = parseIntMethod();

        assertEquals(8080, (int) method.invoke(null, null, 8080));
        assertEquals(8181, (int) method.invoke(null, "   ", 8181));
    }

    @Test
    void parseIntTrimsNumericValues() throws Exception {
        assertEquals(9090, (int) parseIntMethod().invoke(null, " 9090 ", 8080));
    }

    @Test
    void parseIntRejectsInvalidNumbers() throws Exception {
        Method method = parseIntMethod();
        InvocationTargetException thrown = assertThrows(
            InvocationTargetException.class,
            () -> method.invoke(null, "bogus", 8080)
        );

        assertInstanceOf(NumberFormatException.class, thrown.getCause());
    }

    @Test
    void parseLongReturnsDefaultForNullAndBlank() throws Exception {
        Method method = parseLongMethod();

        assertEquals(50000L, (long) method.invoke(null, null, 50000L));
        assertEquals(50000L, (long) method.invoke(null, "\t", 50000L));
    }

    @Test
    void parseLongTrimsNumericValues() throws Exception {
        assertEquals(60000L, (long) parseLongMethod().invoke(null, " 60000 ", 0L));
    }

    @Test
    void parseLongRejectsInvalidNumbers() throws Exception {
        Method method = parseLongMethod();
        InvocationTargetException thrown = assertThrows(
            InvocationTargetException.class,
            () -> method.invoke(null, "bogus", 50000L)
        );

        assertInstanceOf(NumberFormatException.class, thrown.getCause());
    }

    private Method parseIntMethod() throws NoSuchMethodException {
        Method method = ServiceConfig.class.getDeclaredMethod("parseInt", String.class, int.class);
        method.setAccessible(true);
        return method;
    }

    private Method parseLongMethod() throws NoSuchMethodException {
        Method method = ServiceConfig.class.getDeclaredMethod("parseLong", String.class, long.class);
        method.setAccessible(true);
        return method;
    }
}