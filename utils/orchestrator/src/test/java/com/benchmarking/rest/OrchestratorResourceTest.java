package com.benchmarking.rest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Unit tests for OrchestratorResource.
 * Tests command validation, execution, and job management.
 */
@QuarkusTest
public class OrchestratorResourceTest {

    @ConfigProperty(name = "orchestrator.api.key", defaultValue = "dev-token-changeme")
    String apiKey;

    /**
     * Test that /v1/run requires authentication.
     */
    @Test
    public void testRunRequiresAuth() {
        given()
                .contentType(ContentType.JSON)
                .body("{\"command\":\"docker ps\"}")
                .when().post("/v1/run")
                .then()
                .statusCode(401);
    }

    /**
     * Test that /v1/run validates command format.
     */
    @Test
    public void testRunValidatesCommand() {
        given()
                .header("Authorization", "Bearer " + apiKey)
                .contentType(ContentType.JSON)
                .body("{}")
                .when().post("/v1/run")
                .then()
                .statusCode(anyOf(is(400), is(500)));
    }

    /**
     * Test that /v1/run accepts valid docker compose command.
     */
    @Test
    public void testRunAcceptsValidCommand() {
        given()
                .header("Authorization", "Bearer " + apiKey)
                .contentType(ContentType.JSON)
                .body("{\"command\":\"docker compose version\"}")
                .when().post("/v1/run")
                .then()
                .statusCode(anyOf(is(200), is(201), is(202)))
                .body("jobId", notNullValue());
    }

    /**
     * Test that /v1/run rejects invalid commands with dangerous patterns.
     */
    @Test
    public void testRunRejectsDangerousCommand() {
        given()
                .header("Authorization", "Bearer " + apiKey)
                .contentType(ContentType.JSON)
                .body("{\"command\":\"docker ps; rm -rf /\"}")
                .when().post("/v1/run")
                .then()
                .statusCode(400);
    }

    /**
     * Test that /v1/run rejects commands with invalid prefix.
     */
    @Test
    public void testRunRejectsInvalidPrefix() {
        given()
                .header("Authorization", "Bearer " + apiKey)
                .contentType(ContentType.JSON)
                .body("{\"command\":\"rm -rf /tmp\"}")
                .when().post("/v1/run")
                .then()
                .statusCode(400);
    }

    /**
     * Test that /v1/jobs/{jobId} returns job status.
     */
    @Test
    public void testGetJobStatus() {
        // First, create a job
        String jobId = given()
                .header("Authorization", "Bearer " + apiKey)
                .contentType(ContentType.JSON)
                .body("{\"command\":\"docker compose version\"}")
                .when().post("/v1/run")
                .then()
                .statusCode(anyOf(is(200), is(201), is(202)))
                .extract().path("jobId");

        // Then, get its status
        given()
                .header("Authorization", "Bearer " + apiKey)
                .when().get("/v1/jobs/" + jobId)
                .then()
                .statusCode(200)
                .body("jobId", equalTo(jobId))
                .body("status", notNullValue());
    }
}
