package io.github.georgecodes.benchmarking.helidon.mp;

import io.helidon.microprofile.testing.junit5.HelidonTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.client.WebTarget;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration test for Helidon MP JAX-RS endpoints.
 * {@link HelidonTest} starts a full CDI + web server per test class.
 */
@HelidonTest
class HelloResourceTest {

    @Inject
    private WebTarget target;

    @Test
    void virtualEndpoint() {
        try (Response response = target.path("/hello/virtual")
                .request(MediaType.APPLICATION_JSON)
                .get()) {
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            String body = response.readEntity(String.class);
            assertTrue(body.contains("Hello from Helidon MP virtual REST"),
                    "Expected body to contain 'Hello from Helidon MP virtual REST' but was: " + body);
        }
    }

    @Test
    void virtualEndpointWithSleep() {
        try (Response response = target.path("/hello/virtual")
                .queryParam("sleep", "0")
                .request(MediaType.APPLICATION_JSON)
                .get()) {
            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            String body = response.readEntity(String.class);
            assertTrue(body.contains("Hello from Helidon MP virtual REST"));
        }
    }

    @Test
    void healthEndpoint() {
        try (Response response = target.path("/health")
                .request(MediaType.APPLICATION_JSON)
                .get()) {
            assertTrue(
                    response.getStatus() == 200 || response.getStatus() == 204,
                    "Expected 200 or 204 but was: " + response.getStatus());
        }
    }
}