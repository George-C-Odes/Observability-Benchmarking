package io.github.georgecodes.benchmarking.helidon.se;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HelidonApplicationTest {

    @Test
    void resolveServiceNameUsesOtelServiceNameFromEnvironment() {
        assertEquals(
                "custom-se-service",
                HelidonApplication.resolveServiceName(Map.of("OTEL_SERVICE_NAME", "custom-se-service")));
    }

    @Test
    void resolveServiceNameDefaultsWhenOtelServiceNameMissing() {
        assertEquals(
                HelidonApplication.DEFAULT_SERVICE_NAME,
                HelidonApplication.resolveServiceName(Map.of()));
    }

    @Test
    void resolveServiceNameDefaultsWhenOtelServiceNameBlank() {
        assertEquals(
                HelidonApplication.DEFAULT_SERVICE_NAME,
                HelidonApplication.resolveServiceName(Map.of("OTEL_SERVICE_NAME", "   ")));
    }
}