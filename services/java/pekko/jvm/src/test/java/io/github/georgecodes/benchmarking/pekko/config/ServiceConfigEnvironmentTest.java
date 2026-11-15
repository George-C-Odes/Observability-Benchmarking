package io.github.georgecodes.benchmarking.pekko.config;

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
        assertEquals(new ServiceConfig(8080, 50000L),
                ServiceConfig.fromEnvironment(_ -> value));
    }

    @Test
    void numericValuesAreTrimmedAndLongSettingsDoNotTruncateToInt() {
        Map<String, String> environment = Map.of("SERVICE_PORT", " 9091 ", "CACHE_SIZE", " 3000000000 ");
        assertEquals(new ServiceConfig(9091, 3000000000L), ServiceConfig.fromEnvironment(environment::get));
    }

    @ParameterizedTest
    @CsvSource({
        "SERVICE_PORT,not-a-number",
        "SERVICE_PORT,2147483648",
        "CACHE_SIZE,not-a-number",
        "CACHE_SIZE,9223372036854775808"
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
