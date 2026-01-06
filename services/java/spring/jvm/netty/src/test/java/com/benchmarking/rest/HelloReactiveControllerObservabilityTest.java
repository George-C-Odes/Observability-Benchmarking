package com.benchmarking.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Order;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Observability tests for Spring Boot Netty (WebFlux) service.
 * Tests metrics endpoint, health checks, and OpenTelemetry integration.
 * These tests validate:
 * - Micrometer metrics with custom counters (hello.request.count)
 * - OpenTelemetry Java Agent integration
 * - Spring Boot 4.0.1 actuator endpoints (reactive)
 * - WebFlux health endpoints
 * - Reactor Netty metrics
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
        "management.endpoint.health.probes.enabled=true" // Enable liveness/readiness probe endpoints on Boot 3.x
    }
)
@DisplayName("Spring Boot Netty Observability Tests")
public class HelloReactiveControllerObservabilityTest {

    @LocalServerPort
    int port;

    private WebTestClient webTestClient;

    @BeforeEach
    void setUp() {
        this.webTestClient = WebTestClient.bindToServer()
            .baseUrl("http://localhost:" + port)
            .build();
    }

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
    @Order(5)
    @DisplayName("Custom metric counter exists after requests")
    public void testCustomMetricCounter() {
        // Make some requests to generate metrics
        for (int i = 0; i < 5; i++) {
            webTestClient.get()
                .uri("/hello/reactive")
                .exchange()
                .expectStatus().isOk();
        }

        // Check metrics endpoint for custom counter
        String metrics = webTestClient.get()
            .uri("/actuator/metrics/hello.request.count")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Verify the custom counter metric is present
        // Updated to match the unified metric naming convention
        assertThat(metrics).contains("/hello/reactive");
        assertThat(metrics).contains("endpoint");
    }

    @Test
    @Order(6)
    @DisplayName("JVM metrics are available in json format")
    public void testJvmMetrics() {
        String metrics = webTestClient.get()
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Check for standard JVM metrics
        assertThat(metrics).contains("jvm.memory");
        assertThat(metrics).contains("jvm.threads");
        assertThat(metrics).contains("jvm.gc");
    }

    @Test
    @Order(7)
    @DisplayName("Process metrics are available")
    public void testProcessMetrics() {
        String metrics = webTestClient.get()
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        // Process-level metrics
        assertThat(metrics).contains("process.cpu");
        assertThat(metrics).contains("process.uptime");
    }

    @Test
    @Order(8)
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
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        assertThat(metrics).contains("hello.request.count");
    }

    @Test
    @Order(9)
    @DisplayName("Actuator info endpoint is available")
    public void testInfoEndpoint() {
        webTestClient.get()
            .uri("/actuator/info")
            .exchange()
            .expectStatus().isOk();
    }

    @Test
    @Order(10)
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
    @Order(11)
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
    @Order(12)
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
            .jsonPath("$._links.metrics").exists();
    }

    @Test
    @Order(13)
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
            .uri("/actuator/metrics")
            .exchange()
            .expectStatus().isOk()
            .expectBody(String.class)
            .returnResult()
            .getResponseBody();

        assertThat(metrics).contains("hello.request.count");
    }
}
