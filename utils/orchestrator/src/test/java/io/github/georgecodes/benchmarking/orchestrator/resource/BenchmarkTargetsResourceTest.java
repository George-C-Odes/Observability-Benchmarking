package io.github.georgecodes.benchmarking.orchestrator.resource;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.is;

/**
 * Unit tests for BenchmarkTargetsResource.
 * Tests benchmark targets retrieval and update operations.
 */
@QuarkusTest
public class BenchmarkTargetsResourceTest {

    @ConfigProperty(name = "orchestrator.api-key")
    String apiKey;

    /**
     * Test that /v1/benchmark-targets GET returns benchmark target URLs.
     */
    @Test
    public void testGetBenchmarkTargets() {
        given()
            .when().get("/v1/benchmark-targets")
            .then()
            .statusCode(anyOf(is(200), is(404))) // 404 if file doesn't exist in test environment
            .contentType(ContentType.JSON);
    }

    /**
     * Test that /v1/benchmark-targets POST requires authentication.
     */
    @Test
    public void testUpdateBenchmarkTargetsRequiresAuth() {
        given()
            .contentType(ContentType.JSON)
            .body("{\"urls\":[\"http://quarkus-jvm:8080/hello/platform\"]}")
            .when().post("/v1/benchmark-targets")
            .then()
            .statusCode(401);
    }

    /**
     * Test that /v1/benchmark-targets POST validates the request body.
     */
    @Test
    public void testUpdateBenchmarkTargetsValidatesBody() {
        given()
            .header("Authorization", "Bearer " + apiKey)
            .contentType(ContentType.JSON)
            .body("{}")
            .when().post("/v1/benchmark-targets")
            .then()
            .statusCode(400);
    }

    /**
     * Test that /v1/benchmark-targets POST rejects invalid URL schemes.
     */
    @Test
    public void testUpdateBenchmarkTargetsRejectsInvalidUrls() {
        given()
            .header("Authorization", "Bearer " + apiKey)
            .contentType(ContentType.JSON)
            .body("{\"urls\":[\"ftp://bad-scheme:8080/hello/platform\"]}")
            .when().post("/v1/benchmark-targets")
            .then()
            .statusCode(400); // 400 for URL validation error
    }
}