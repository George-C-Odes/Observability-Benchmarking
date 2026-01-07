package com.benchmarking.rest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Unit tests for EnvResource.
 * Tests environment file retrieval and update operations.
 */
@QuarkusTest
public class EnvResourceTest {

    @ConfigProperty(name = "orchestrator.api-key")
    String apiKey;

    /**
     * Test that /v1/env GET returns environment file content.
     */
    @Test
    public void testGetEnvFile() {
        given()
            .when().get("/v1/env")
            .then()
            .statusCode(anyOf(is(200), is(404))) // 404 if file doesn't exist in test environment
            .contentType(ContentType.JSON);
    }

    /**
     * Test that /v1/env POST requires authentication.
     */
    @Test
    public void testUpdateEnvRequiresAuth() {
        given()
            .contentType(ContentType.JSON)
            .body("{\"content\":\"TEST=value\"}")
            .when().post("/v1/env")
            .then()
            .statusCode(401);
    }

    /**
     * Test that /v1/env POST validates request body.
     */
    @Test
    public void testUpdateEnvValidatesContent() {
        given()
            .header("Authorization", "Bearer " + apiKey)
            .contentType(ContentType.JSON)
            .body("{}")
            .when().post("/v1/env")
            .then()
            .statusCode(400);
    }

    /**
     * Test that /v1/env POST rejects empty content.
     */
    @Test
    public void testUpdateEnvRejectsEmptyContent() {
        given()
            .header("Authorization", "Bearer " + apiKey)
            .contentType(ContentType.JSON)
            .body("{\"content\":\"\"}")
            .when().post("/v1/env")
            .then()
            .statusCode(400);
    }
}
