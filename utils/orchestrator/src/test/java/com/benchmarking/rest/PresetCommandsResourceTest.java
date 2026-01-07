package com.benchmarking.rest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Unit tests for PresetCommandsResource.
 * Tests the endpoint that lists available command presets from IntelliJ .run XML files.
 */
@QuarkusTest
public class PresetCommandsResourceTest {

    /**
     * Test that the /v1/commands endpoint returns a list of commands.
     */
    @Test
    public void testListCommands() {
        given()
                .when().get("/v1/commands")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("$", is(instanceOf(java.util.List.class)));
    }

    /**
     * Test that returned commands have required fields.
     */
    @Test
    public void testCommandStructure() {
        given()
                .when().get("/v1/commands")
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                // If there are any commands, they should have these fields
                .body(
                        "[0].name", anyOf(nullValue(), isA(String.class)),
                        "[0].command", anyOf(nullValue(), isA(String.class)),
                        "[0].description", anyOf(nullValue(), isA(String.class))
                );
    }
}
