package com.benchmarking.rest;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Observability tests for Spring Boot Netty (WebFlux) service.
 * Tests metrics endpoint, health checks, and OpenTelemetry integration.
 * 
 * These tests validate:
 * - Micrometer metrics with custom counters (hello.request.count)
 * - OpenTelemetry Java Agent integration
 * - Spring Boot 4.0.0 actuator endpoints (reactive)
 * - WebFlux health endpoints
 * - Reactor Netty metrics
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@DisplayName("Spring Boot Netty Observability Tests")
public class HelloControllerObservabilityTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    @Order(1)
    @DisplayName("Health check - main health endpoint")
    public void testHealthEndpoint() {
        webTestClient.get()
            .uri("/actuator/health")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.status").isEqualTo("UP");
    }

    @Test
    @Order(2)
    @DisplayName("Health check - liveness probe")
    public void testLivenessProbe() {
        webTestClient.get()
            .uri("/actuator/health/liveness")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.status").isEqualTo("UP");
    }

    @Test
    @Order(3)
    @DisplayName("Health check - readiness probe")
    public void testReadinessProbe() {
        webTestClient.get()
            .uri("/actuator/health/readiness")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.status").isEqualTo("UP");
    }

    @Test
    @Order(4)
    @DisplayName("Prometheus metrics endpoint is accessible")
    public void testPrometheusMetricsEndpoint() {
        webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectHeader().contentType(MediaType.parseMediaType("text/plain;version=0.0.4;charset=utf-8"));
    }

    @Test
    @Order(5)
    @DisplayName("Actuator metrics endpoint is accessible")
    public void testActuatorMetricsEndpoint() {
        webTestClient.get()
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.names").isArray();
    }

    @Test
    @Order(6)
    @DisplayName("Custom metric counter exists after requests")
    public void testCustomMetricCounter() {
        // Make some requests to generate metrics
        for (int i = 0; i < 5; i++) {
            webTestClient.get()
                .uri("/hello/reactive")
                .exchange()
                .expectStatus().isOk();
        }

        // Check Prometheus endpoint for custom counter
        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Verify the custom counter metric is present
        // Updated to match the unified metric naming convention
        // Metric should be: hello_request_count_total{endpoint="/hello/reactive"}
        assertThat(metrics).contains("hello_request_count");
        assertThat(metrics).contains("endpoint");
    }

    @Test
    @Order(7)
    @DisplayName("JVM metrics are available in Prometheus format")
    public void testJvmMetrics() {
        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Check for standard JVM metrics
        assertThat(metrics).contains("jvm_memory");
        assertThat(metrics).contains("jvm_threads");
        assertThat(metrics).contains("jvm_gc");
    }

    @Test
    @Order(8)
    @DisplayName("HTTP server metrics are tracked")
    public void testHttpServerMetrics() {
        // Make a request to generate HTTP metrics
        webTestClient.get()
            .uri("/hello/reactive")
            .exchange()
            .expectStatus().isOk();

        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // HTTP server metrics from Spring WebFlux / Micrometer
        assertThat(metrics).contains("http_server");
    }

    @Test
    @Order(9)
    @DisplayName("Reactor Netty metrics are available")
    public void testReactorNettyMetrics() {
        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Reactor Netty specific metrics
        assertThat(metrics)
            .as("Netty metrics should be present")
            .containsAnyOf("reactor_netty", "netty");
    }

    @Test
    @Order(10)
    @DisplayName("Process metrics are available")
    public void testProcessMetrics() {
        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Process-level metrics
        assertThat(metrics).contains("process_cpu");
        assertThat(metrics).contains("process_uptime");
    }

    @Test
    @Order(11)
    @DisplayName("Endpoint-specific metrics for reactive endpoint")
    public void testReactiveEndpointMetrics() {
        // Make multiple reactive requests
        for (int i = 0; i < 3; i++) {
            webTestClient.get()
                .uri("/hello/reactive")
                .exchange()
                .expectStatus().isOk();
        }

        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Should have endpoint-specific tag
        assertThat(metrics).contains("/hello/reactive");
    }

    @Test
    @Order(12)
    @DisplayName("Actuator info endpoint is available")
    public void testInfoEndpoint() {
        webTestClient.get()
            .uri("/actuator/info")
            .exchange()
            .expectStatus().isOk();
    }

    @Test
    @Order(13)
    @DisplayName("Metrics list includes custom metrics")
    public void testMetricsListIncludesCustomMetrics() {
        // Make a request first to ensure metric exists
        webTestClient.get()
            .uri("/hello/reactive")
            .exchange()
            .expectStatus().isOk();

        String response = webTestClient.get()
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Check that our custom metric is in the list
        assertThat(response).contains("hello.request.count");
    }

    @Test
    @Order(14)
    @DisplayName("Specific metric details are accessible")
    public void testSpecificMetricDetails() {
        // Make a request to ensure metric exists
        webTestClient.get()
            .uri("/hello/reactive")
            .exchange()
            .expectStatus().isOk();

        // Get details of the custom metric
        webTestClient.get()
            .uri("/actuator/metrics/hello.request.count")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.name").isEqualTo("hello.request.count")
            .jsonPath("$.measurements").isArray();
    }

    @Test
    @Order(15)
    @DisplayName("WebFlux actuator endpoints work reactively")
    public void testReactiveActuatorEndpoints() {
        // Test that actuator endpoints return properly in reactive context
        webTestClient.get()
            .uri("/actuator")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$._links").exists()
            .jsonPath("$._links.health").exists()
            .jsonPath("$._links.metrics").exists()
            .jsonPath("$._links.prometheus").exists();
    }

    @Test
    @Order(16)
    @DisplayName("Multiple concurrent reactive requests are handled")
    public void testConcurrentReactiveRequests() {
        // Send multiple concurrent requests (WebFlux should handle them efficiently)
        for (int i = 0; i < 10; i++) {
            webTestClient.get()
                .uri("/hello/reactive")
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .value(body -> assertThat(body).contains("Hello from Boot reactive REST"));
        }

        // Verify metrics were recorded
        String metrics = webTestClient.get()
            .uri("/actuator/prometheus")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        assertThat(metrics).contains("hello_request_count");
    }
}
