package io.github.georgecodes.benchmarking.quarkus.rest;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.containsString;

@QuarkusTest
public class HelloResourceTest {

    @Test
    public void testPlatformEndpoint() {
        given()
            .when().get("/hello/platform")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus platform REST"));
    }

    @Test
    public void testPlatformEndpointWithSleep() {
        given()
            .queryParam("sleep", 1)
            .when().get("/hello/platform")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus platform REST"));
    }

    @Test
    public void testPlatformEndpointWithLog() {
        given()
            .queryParam("log", true)
            .when().get("/hello/platform")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus platform REST"));
    }

    @Test
    public void testVirtualEndpoint() {
        given()
            .when().get("/hello/virtual")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus virtual REST"));
    }

    @Test
    public void testVirtualEndpointWithSleep() {
        given()
            .queryParam("sleep", 1)
            .when().get("/hello/virtual")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus virtual REST"));
    }

    @Test
    public void testVirtualEndpointWithLog() {
        given()
            .queryParam("log", true)
            .when().get("/hello/virtual")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus virtual REST"));
    }

    @Test
    public void testReactiveEndpoint() {
        given()
            .when().get("/hello/reactive")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus reactive REST"));
    }

    @Test
    public void testReactiveEndpointWithSleep() {
        given()
            .queryParam("sleep", 1)
            .when().get("/hello/reactive")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus reactive REST"));
    }

    @Test
    public void testReactiveEndpointWithLog() {
        given()
            .queryParam("log", true)
            .when().get("/hello/reactive")
            .then()
            .statusCode(200)
            .contentType(ContentType.JSON)
            .body(containsString("Hello from Quarkus reactive REST"));
    }
}
