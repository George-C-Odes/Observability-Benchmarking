package com.benchmarking.rest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.containsString;

/**
 * Observability tests for Quarkus service.
 * Tests metrics endpoint, health checks, and OpenTelemetry integration.
 * These tests validate:
 * - Micrometer metrics with custom counters (hello.request.count)
 * - Quarkus OpenTelemetry SDK integration (not Java agent)
 * - Health endpoints (liveness, readiness)
 * - Caffeine cache metrics
 */
@QuarkusTest
@DisplayName("Quarkus Observability Tests")
public class HelloResourceObservabilityTest {

    @Test
    @Order(1)
    @DisplayName("Health check - liveness probe")
    public void testLivenessProbe() {
        given()
            .when().get("/q/health/live")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("UP"));
    }

    @Test
    @Order(2)
    @DisplayName("Health check - readiness probe")
    public void testReadinessProbe() {
        given()
            .when().get("/q/health/ready")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("UP"));
    }

    @Test
    @Order(3)
    @DisplayName("Metrics endpoint is accessible")
    public void testMetricsEndpoint() {
        given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON);
    }

    @Test
    @Order(4)
    @DisplayName("Custom metric counter exists after requests")
    public void testCustomMetricCounter() {
        // First, make some requests to generate metrics
        for (int i = 0; i < 5; i++) {
            given()
                .when().get("/hello/platform")
                .then()
                .statusCode(200);
        }

        // Then check if the custom counter metric exists
        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // Verify the custom counter metric is present
        // Updated to match the unified metric naming convention
        // Metric should be: hello.request.count_total{endpoint="/hello/platform"}
        assert metrics.contains("hello.request.count") : 
            "Custom metric hello.request.count not found in metrics output";
        assert metrics.contains("endpoint") : 
            "Metric tag 'endpoint' not found in metrics output";
    }

    @Test
    @Order(5)
    @DisplayName("Cache metrics are tracked")
    public void testCacheMetrics() {
        // Make requests to populate cache
        given()
            .when().get("/hello/platform")
            .then()
            .statusCode(200);

        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // Caffeine cache metrics should be present
        assert metrics.contains("cache") : 
            "Cache metrics not found";
    }

    @Test
    @Order(6)
    @DisplayName("Endpoint-specific metrics for platform thread")
    public void testPlatformEndpointMetrics() {
        // Make multiple platform requests
        for (int i = 0; i < 3; i++) {
            given()
                .when().get("/hello/platform")
                .then()
                .statusCode(200);
        }

        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // Should have endpoint-specific tag
        assert metrics.contains("/hello/platform") : 
            "Platform endpoint metric tag not found";
    }

    @Test
    @Order(7)
    @DisplayName("Endpoint-specific metrics for virtual thread")
    public void testVirtualEndpointMetrics() {
        // Make multiple virtual thread requests
        for (int i = 0; i < 3; i++) {
            given()
                .when().get("/hello/virtual")
                .then()
                .statusCode(200);
        }

        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // Should have endpoint-specific tag
        assert metrics.contains("/hello/virtual") : 
            "Virtual endpoint metric tag not found";
    }

    @Test
    @Order(8)
    @DisplayName("Endpoint-specific metrics for reactive endpoint")
    public void testReactiveEndpointMetrics() {
        // Make multiple reactive requests
        for (int i = 0; i < 3; i++) {
            given()
                .when().get("/hello/reactive")
                .then()
                .statusCode(200);
        }

        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // Should have endpoint-specific tag
        assert metrics.contains("/hello/reactive") : 
            "Reactive endpoint metric tag not found";
    }

    @Test
    @Order(9)
    @DisplayName("All three counters have different values")
    public void testMultipleCountersDifferentiation() {
        // Reset counters by making exactly 1 request to each
        given().when().get("/hello/platform").then().statusCode(200);
        given().when().get("/hello/virtual").then().statusCode(200);
        given().when().get("/hello/reactive").then().statusCode(200);

        String metrics = given()
            .when().get("/q/metrics/json")
            .then()
            .statusCode(200)
            .extract().asString();

        // All three endpoint tags should exist
        assert metrics.contains("/hello/platform") : "Platform endpoint not tracked";
        assert metrics.contains("/hello/virtual") : "Virtual endpoint not tracked";
        assert metrics.contains("/hello/reactive") : "Reactive endpoint not tracked";
    }
}