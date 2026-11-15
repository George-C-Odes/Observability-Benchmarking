package io.github.georgecodes.benchmarking.dropwizard.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ServiceConfigEnvironmentTest {

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t"})
    void missingAndBlankValuesUseDefaults(String value) {
        assertEquals(new ServiceConfig(8080, ServiceConfig.ThreadMode.PLATFORM, 50000L, 0, 0, 10000, 60000L),
                ServiceConfig.fromEnvironment(_ -> value));
    }

    @Test
    void numericValuesAreTrimmedAndLongSettingsDoNotTruncateToInt() {
        Map<String, String> environment = Map.of(
            "SERVICE_PORT", " 9091 ",
            "THREAD_MODE", " VTHREADS ",
            "CACHE_SIZE", " 3000000000 ",
            "JETTY_MAX_THREADS", " 64 ",
            "JETTY_MIN_THREADS", " 8 ",
            "JETTY_ACCEPT_QUEUE_SIZE", " 2048 ",
            "JETTY_IDLE_TIMEOUT_MS", " 3000000001 "
        );
        assertEquals(new ServiceConfig(9091, ServiceConfig.ThreadMode.VIRTUAL,
                3000000000L, 64, 8, 2048, 3000000001L),
                ServiceConfig.fromEnvironment(environment::get));
    }

    @ParameterizedTest
    @CsvSource({
        "SERVICE_PORT,not-a-number",
        "SERVICE_PORT,2147483648",
        "CACHE_SIZE,not-a-number",
        "CACHE_SIZE,9223372036854775808",
        "JETTY_MAX_THREADS,not-a-number",
        "JETTY_MIN_THREADS,2147483648",
        "JETTY_ACCEPT_QUEUE_SIZE,not-a-number",
        "JETTY_IDLE_TIMEOUT_MS,9223372036854775808"
    })
    void invalidOrOverflowingNumericSettingsAreRejected(String key, String value) {
        Map<String, String> environment = Map.of(key, value);
        assertThrows(NumberFormatException.class, () -> ServiceConfig.fromEnvironment(environment::get));
    }

    @Test
    void nullEnvironmentReaderIsRejected() {
        assertThrows(NullPointerException.class, () -> ServiceConfig.fromEnvironment(null));
    }
}
